import {asArray} from '@ng-doc/core';
import * as path from 'path';
import {EMPTY, forkJoin, merge, Observable, of, Subject} from 'rxjs';
import {
	concatMap,
	map,
	mapTo,
	mergeMap,
	startWith,
	switchMap,
	take,
	takeUntil,
	tap,
	withLatestFrom,
} from 'rxjs/operators';
import {Project} from 'ts-morph';

import {createProject, emitBuiltOutput, generateApiEntities} from '../helpers';
import {buildGlobalIndexes} from '../helpers/build-global-indexes';
import {generateKeywordsDictionary} from '../helpers/generate-keywords-dictionary';
import {NgDocBuilderContext, NgDocBuiltOutput} from '../interfaces';
import {bufferDebounce} from '../operators';
import {NgDocContextEnv, NgDocRoutingEnv} from '../templates-env';
import {NgDocKeywordsDictionaryEnv} from '../templates-env/keywords-dictionary.env';
import {Constructable} from '../types';
import {
	NgDocApiEntity,
	NgDocCategoryEntity,
	NgDocDependenciesEntity,
	NgDocPageEntity,
	NgDocPlaygroundEntity,
} from './entities';
import {NgDocEntity} from './entities/abstractions/entity';
import {NgDocEntityStore} from './entity-store';
import {buildCandidates} from './functions/build-candidates';
import {NgDocRenderer} from './renderer';
import {
	API_PATTERN,
	CACHE_PATH,
	CATEGORY_PATTERN,
	GENERATED_ASSETS_PATH,
	GENERATED_PATH,
	PAGE_DEPENDENCY_PATTERN,
	PAGE_PATTERN,
	PLAYGROUND_PATTERN,
} from './variables';
import {NgDocWatcher} from './watcher';

export class NgDocBuilder {
	readonly entities: NgDocEntityStore = new NgDocEntityStore();
	private readonly project: Project;
	private readonly watcher: NgDocWatcher;
	private readonly touchEntity: Subject<NgDocEntity> = new Subject<NgDocEntity>();

	constructor(private readonly context: NgDocBuilderContext) {

		this.project = createProject({
			tsConfigFilePath: this.context.tsConfig,
			compilerOptions: {
				rootDir: this.context.context.workspaceRoot,
				outDir: CACHE_PATH,
			},
		});

		this.watcher = new NgDocWatcher().watch(
			asArray(this.context.options.ngDoc.pages)
				.map((pagesPath: string) => [
					path.join(pagesPath, PAGE_PATTERN),
					path.join(pagesPath, CATEGORY_PATTERN),
					path.join(pagesPath, PAGE_DEPENDENCY_PATTERN),
					path.join(pagesPath, API_PATTERN),
					path.join(pagesPath, PLAYGROUND_PATTERN),
				])
				.flat(),
		);

		// New entities that come from FileSystem
		merge(
			this.watcher.onAdd(PAGE_PATTERN).pipe(withLatestFrom(of(NgDocPageEntity))),
			this.watcher.onAdd(CATEGORY_PATTERN).pipe(withLatestFrom(of(NgDocCategoryEntity))),
			this.watcher.onAdd(PAGE_DEPENDENCY_PATTERN).pipe(withLatestFrom(of(NgDocDependenciesEntity))),
			this.watcher.onAdd(API_PATTERN).pipe(withLatestFrom(of(NgDocApiEntity))),
			this.watcher.onAdd(PLAYGROUND_PATTERN).pipe(withLatestFrom(of(NgDocPlaygroundEntity))),
		)
			.pipe(
				map(
					([path, Entity]: [string, Constructable<NgDocEntity>]) =>
						new Entity(this, this.project.addSourceFileAtPath(path), this.context),
				),
			)
			.subscribe((entity: NgDocEntity) => {
				this.entities.set(entity.id, entity);
			});

	}

	run(): Observable<void> {
		console.time('Build documentation');

		const touchedEntity: Observable<NgDocEntity> = this.entities.changes()
			.pipe(
				tap(([entity, removed]: [NgDocEntity, boolean]) => removed ? entity.destroy() : this.watcher.watch(entity.rootFiles)),
				mergeMap(([entity]: [NgDocEntity, boolean]) =>
					entity.destroyed
						? of(entity)
						: merge(
							this.watcher
								.onChange(...entity.rootFiles)
								.pipe(takeUntil(entity.onDestroy())),
							this.watcher
								.onUnlink(...entity.rootFiles)
								.pipe(tap(() => entity.destroy()), take(1))
						)
							.pipe(startWith(null), mapTo(entity))
				)
			)

		return touchedEntity.pipe(
			concatMap((entity: NgDocEntity) => {
				/*
					Refresh and compile source files for all not destroyed entities
				*/
				if (!entity.destroyed) {
					entity.emit();
				}
				/*
					We destroy children entities for NgDocApiEntities because
					they are created based on the NgDocApiEntities
				*/
				if (entity instanceof NgDocApiEntity) {
					entity.children.forEach((child: NgDocEntity) => child.destroy());
				}

				return of(entity);
			}),
			/* Delay to buffer all changes from the FileSystem */
			bufferDebounce(100),
			mergeMap((entities: NgDocEntity[]) =>
				// Re-fetch compiled data for non destroyed entities
				forkJoin(
					entities.map((entity: NgDocEntity) =>
						entity.destroyed
							? of(entity)
							: entity.update().pipe(
									tap(() => {
										/*
											Re-generate children Entities for NgDocApiEntity if it was changed
										 */
										if (entity instanceof NgDocApiEntity) {
											generateApiEntities(entity).forEach((e: NgDocEntity) => this.entities.set(e.id, e));
										}
									}),
									mapTo(entity),
							  ),
					),
				).pipe(
					switchMap((entities: NgDocEntity[]) =>
						merge(
							...entities.map((entity: NgDocEntity) =>
								// Watch for dependency changes of non-destroyed entities
								entity.destroyed
									? of(entity)
									: entity.dependencies.changes().pipe(
											switchMap((dependencies: string[]) =>
												this.watcher.watch(dependencies).onChange(...dependencies),
											),
											startWith(null),
											mapTo(entity),
											takeUntil(entity.onDestroy()),
									  ),
							),
						),
					),
				),
			),
			bufferDebounce(100),
			// Build touched entities and their dependencies
			mergeMap((entities: NgDocEntity[]) =>
				forkJoin(
					entities.map((entity: NgDocEntity) =>
						entity.destroyed
							? EMPTY
							: forkJoin(buildCandidates(entity).map((e: NgDocEntity) => e.buildArtifacts())),
					),
				).pipe(map((output: NgDocBuiltOutput[][][]) => output.flat(2))),
			),
			concatMap((output: NgDocBuiltOutput[]) =>
				// Build Context, Routes and indexes
				forkJoin([this.buildContext(), this.buildRoutes(), this.buildKeywordsDictionary()]).pipe(
					switchMap((contextAndRoutesAndDictionary: NgDocBuiltOutput[]) =>
						this.buildIndexes().pipe(
							tap((indexes: NgDocBuiltOutput[]) => {
								emitBuiltOutput(...[...output.flat(), ...contextAndRoutesAndDictionary, ...indexes]);
								this.collectGarbage();
							}),
							tap(() => console.timeEnd('Build documentation')),
						),
					),
				),
			),
			mapTo(void 0),
		);
	}

	get(id: string): NgDocEntity | undefined {
		return this.entities.get(id);
	}

	private collectGarbage(): void {
		this.entities.asArray().forEach((entity: NgDocEntity) => {
			if (entity.destroyed) {
				entity.removeArtifacts();
				this.entities.delete(entity.id);
			}
		});
	}

	private buildRoutes(): Observable<NgDocBuiltOutput> {
		const entities: NgDocEntity[] = this.rootEntitiesForBuild;
		const renderer: NgDocRenderer<NgDocRoutingEnv> = new NgDocRenderer<NgDocRoutingEnv>({entities});

		return renderer
			.render('routing.ts.nunj')
			.pipe(map((output: string) => ({output, filePath: path.join(GENERATED_PATH, 'ng-doc.routing.ts')})));
	}

	private buildContext(): Observable<NgDocBuiltOutput> {
		const entities: NgDocEntity[] = this.rootEntitiesForBuild;
		const renderer: NgDocRenderer<NgDocRoutingEnv> = new NgDocRenderer<NgDocContextEnv>({entities});

		return renderer
			.render('context.ts.nunj')
			.pipe(map((output: string) => ({output, filePath: path.join(GENERATED_PATH, 'ng-doc.context.ts')})));
	}

	private buildKeywordsDictionary(): Observable<NgDocBuiltOutput> {
		const renderer: NgDocRenderer<NgDocKeywordsDictionaryEnv> = new NgDocRenderer<NgDocKeywordsDictionaryEnv>({dictionary: generateKeywordsDictionary(this.entities.asArray())});

		return renderer
			.render('keywords-dictionary.ts.nunj')
			.pipe(map((output: string) => ({output, filePath: path.join(GENERATED_PATH, 'ng-doc.keywords-dictionary.ts')})));
	}

	private buildIndexes(): Observable<NgDocBuiltOutput[]> {
		const [dictionary, indexes] = buildGlobalIndexes(this.entities.asArray());

		return of([
			{
				output: dictionary,
				filePath: path.join(GENERATED_ASSETS_PATH, 'pages.json'),
			},
			{
				output: indexes,
				filePath: path.join(GENERATED_ASSETS_PATH, 'indexes.json'),
			},
		]);
	}

	get rootEntitiesForBuild(): NgDocEntity[] {
		return asArray(this.entities.values()).filter((entity: NgDocEntity) => entity.isRoot && entity.isReadyToBuild);
	}
}
