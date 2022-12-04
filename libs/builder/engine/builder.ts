import {asArray} from '@ng-doc/core';
import chalk from 'chalk';
import * as path from 'path';
import {asyncScheduler, forkJoin, merge, Observable, of} from 'rxjs';
import {
	catchError,
	concatMap,
	map,
	mapTo,
	mergeMap, share,
	startWith, subscribeOn,
	switchMap, switchMapTo,
	take,
	takeUntil,
	tap,
	withLatestFrom,
} from 'rxjs/operators';
import {Project, SourceFile} from 'ts-morph';

import {createProject, emitBuiltOutput, generateApiEntities} from '../helpers';
import {NgDocBuilderContext, NgDocBuiltOutput} from '../interfaces';
import {bufferDebounce} from '../operators';
import {Constructable} from '../types';
import {
	NgDocApiEntity, NgDocApiPageEntity, NgDocApiScopeEntity,
	NgDocCategoryEntity,
	NgDocDependenciesEntity,
	NgDocPageEntity,
	NgDocPlaygroundEntity,
	NgDocSkeletonEntity,
} from './entities';
import {NgDocEntity} from './entities/abstractions/entity';
import {NgDocEntityStore} from './entity-store';
import {buildCandidates} from './functions/build-candidates';
import {
	API_PATTERN,
	CACHE_PATH,
	CATEGORY_PATTERN,
	PAGE_DEPENDENCY_PATTERN,
	PAGE_PATTERN,
	PLAYGROUND_PATTERN,
} from './variables';
import {NgDocWatcher} from './watcher';
import {bufferEmits} from '../operators/buffer-emits';

export class NgDocBuilder {
	readonly entities: NgDocEntityStore = new NgDocEntityStore();
	readonly skeleton: NgDocSkeletonEntity = new NgDocSkeletonEntity(this, this.context);
	private readonly project: Project;
	private readonly watcher: NgDocWatcher;

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
		const touchedEntity: Observable<NgDocEntity> = this.entities.changes().pipe(
			tap(([entity, removed]: [NgDocEntity, boolean]) =>
				removed ? entity.destroy() : this.watcher.watch(entity.rootFiles),
			),
			mergeMap(([entity]: [NgDocEntity, boolean]) =>
				entity.destroyed
					? of(entity)
					: merge(
							this.watcher.onChange(...entity.rootFiles).pipe(takeUntil(entity.onDestroy())),
							this.watcher.onUnlink(...entity.rootFiles).pipe(
								tap(() => {
									entity.destroy();
								}),
								take(1),
							),
					  ).pipe(startWith(null), mapTo(entity)),
			),
			subscribeOn(asyncScheduler),
			share()
		);

		return touchedEntity.pipe(
			tap(() => {
				this.print('Building documentation');
				this.context.context.reportRunning();
			}),
			mergeMap((entity: NgDocEntity) => {
				/*
					Refresh and compile source files for all not destroyed entities
				*/
				return (entity.destroyed ? of(entity) : entity.emit().pipe(mapTo(entity)))
					.pipe(
						tap(() => {
							/*
								We destroy children entities for NgDocApiEntities because
								they are created based on the NgDocApiEntities
							*/
							if (entity instanceof NgDocApiEntity) {
								entity.children.forEach((child: NgDocEntity) => child.destroy());
							}
						})
					)
			}),
			/* Delay to buffer all changes from the FileSystem */
			bufferEmits(touchedEntity),
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
											generateApiEntities(entity).forEach((e: NgDocEntity) =>
												this.entities.set(e.id, e),
											);
										}
									}),
									catchError((e: Error) => {
										this.context.context.logger.error(`NgDoc error: ${e.message}\n${e.stack}`);

										return of(void 0);
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
			bufferDebounce(0),
			tap(() => this.entities.updateKeywordMap()),
			// Build touched entities and their dependencies
			mergeMap((entities: NgDocEntity[]) =>
				forkJoin(
					buildCandidates(entities).map((entity: NgDocEntity) =>
						entity.destroyed ? of([]) : entity.buildArtifacts(),
					),
				).pipe(
					switchMap((output: NgDocBuiltOutput[][]) =>
						this.skeleton.buildArtifacts()
							.pipe(map((skeleton: NgDocBuiltOutput[]) => [...output.flat(), ...skeleton]))
					),
					tap((output: NgDocBuiltOutput[]) => {
						/*
							We emit files and only after that delete destroyed ones, because otherwise
							angular compiler can raise an error that these items are not exist
						 */
						emitBuiltOutput(...output);
						this.collectGarbage();
						this.print();
					}),
				),
			),
			mapTo(void 0),
			catchError((e: Error) => {
				this.context.context.logger.error(`NgDoc error: ${e.message}\n${e.stack}`);

				return of(void 0);
			}),
		) as unknown as Observable<void>;
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

	private print(text?: string): void {
		process.stdout.clearLine(0);
		process.stdout.cursorTo(0);
		text && process.stdout.write(`${chalk.blue('NgDoc:')} ${chalk.green(text)}`);
	}
}
