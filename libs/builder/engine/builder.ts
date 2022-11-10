import {asArray} from '@ng-doc/core';
import * as path from 'path';
import {EMPTY, forkJoin, merge, Observable, of, Subject} from 'rxjs';
import {
	concatMap,
	filter,
	map,
	mapTo,
	mergeMap,
	startWith,
	switchMap,
	takeUntil,
	tap,
	withLatestFrom
} from 'rxjs/operators';
import {Project} from 'ts-morph';

import {createProject, emitBuildedOutput} from '../helpers';
import {buildGlobalIndexes} from '../helpers/build-global-indexes';
import {NgDocBuilderContext, NgDocBuiltOutput} from '../interfaces';
import {bufferDebounce} from '../operators';
import {NgDocContextEnv, NgDocRoutingEnv} from '../templates-env';
import {Constructable} from '../types';
import {
	NgDocApiEntity,
	NgDocCategoryEntity,
	NgDocDependenciesEntity,
	NgDocPageEntity,
	NgDocPlaygroundEntity,
} from './entities';
import {NgDocEntity} from './entities/abstractions/entity';
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

export class NgDocBuilder implements Iterable<NgDocEntity> {
	private readonly project: Project;
	private readonly entities: Map<string, NgDocEntity> = new Map<string, NgDocEntity>();
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
				this.add(entity);
			});

		this.watcher.onUnlink(PAGE_PATTERN, CATEGORY_PATTERN, PAGE_DEPENDENCY_PATTERN, API_PATTERN, PLAYGROUND_PATTERN)
			.subscribe((path: string) => {
				const entity: NgDocEntity | undefined = this.get(path);

				if (entity) {
					entity.destroy();
				}
			})
	}

	run(): Observable<void> {
		console.time('Build documentation');

		return this.touchEntity
			.pipe(
				concatMap((entity: NgDocEntity) => {
					if (!entity.destroyed) {
						entity.sourceFile.refreshFromFileSystemSync();
						entity.sourceFile.emitSync();

						if (entity instanceof NgDocApiEntity) {
							entity.children.forEach((child: NgDocEntity) => {
								child.destroy();
								this.remove(child);
							});
						}
					}
					return of(entity);
				}),
				bufferDebounce(100),
				mergeMap((entities: NgDocEntity[]) =>
					forkJoin(entities.map((entity: NgDocEntity) => entity.destroyed ? of(entity) : entity.update().pipe(mapTo(entity))))
						.pipe(
							switchMap((entities: NgDocEntity[]) =>
								merge(
									...entities
										.map((entity: NgDocEntity) =>
											entity.destroyed
												? of(entity)
												: entity.dependencies.changes()
													.pipe(
														switchMap((dependencies: string[]) =>
																this.watcher.watch(dependencies).onChange(...dependencies)
														),
														startWith(null),
														mapTo(entity),
														takeUntil(
															merge(
																this.touchEntity.pipe(filter((e: NgDocEntity) => e === entity)),
																entity.onDestroy(),
															),
														),
													),
										),
								),
							)
						)
				),
				mergeMap((entity: NgDocEntity) => entity.destroyed ? EMPTY : entity.buildArtifacts()),
				bufferDebounce(100),
				concatMap((output: NgDocBuiltOutput[][]) =>
					forkJoin([this.buildContext(), this.buildRoutes()])
						.pipe(
							switchMap((contextAndRoutes: NgDocBuiltOutput[]) =>
								this.buildIndexes()
									.pipe(
										tap((indexes: NgDocBuiltOutput[]) => {
											emitBuildedOutput(...[...output.flat(), ...contextAndRoutes, ...indexes]);
											this.collectGarbage();
										}),
										tap(() => console.timeEnd('Build documentation')),
									)
							),
						)
				),
				mapTo(void 0)
			)
	}

	*[Symbol.iterator](): Iterator<NgDocEntity> {
		for (const value of asArray(this.entities.values())) {
			yield value;
		}
	}

	asArray(): NgDocEntity[] {
		return asArray(this);
	}

	get(id: string): NgDocEntity | undefined {
		return this.entities.get(id);
	}

	private add(entity: NgDocEntity): void {
		if (this.entities.get(entity.id)) {
			throw new Error(`Entity with id "${entity.id}" already exists.`);
		}
		this.entities.set(entity.id, entity);
		this.touchEntity.next(entity);
	}

	private remove(entity: NgDocEntity): void {
		this.entities.delete(entity.id);
		this.touchEntity.next(entity);
	}

	private collectGarbage(): void {
		asArray(this.entities.values()).forEach((entity: NgDocEntity) => entity.destroyed && this.remove(entity));
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

	private buildIndexes(): Observable<NgDocBuiltOutput[]> {
		const [dictionary, indexes] = buildGlobalIndexes(this.asArray());

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
