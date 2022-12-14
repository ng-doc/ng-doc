import {asArray} from '@ng-doc/core';
import * as path from 'path';
import {forkJoin, from, merge, Observable, of} from 'rxjs';
import {catchError, map, mapTo, mergeMap, startWith, switchMap, takeUntil, tap} from 'rxjs/operators';
import {Project} from 'ts-morph';

import {createProject, emitBuiltOutput} from '../helpers';
import {NgDocBuilderContext, NgDocBuiltOutput} from '../interfaces';
import {bufferDebounce} from '../operators';
import {bufferUntilOnce} from '../operators/buffer-until-once';
import {
	NgDocApiEntity,
	NgDocCategoryEntity,
	NgDocDependenciesEntity,
	NgDocPageEntity,
	NgDocSkeletonEntity,
} from './entities';
import {NgDocEntity} from './entities/abstractions/entity';
import {entityLifeCycle} from './entity-life-cycle';
import {NgDocEntityStore} from './entity-store';
import {buildCandidates} from './functions/build-candidates';
import {API_PATTERN, CACHE_PATH, CATEGORY_PATTERN, PAGE_DEPENDENCY_PATTERN, PAGE_PATTERN} from './variables';
import {NgDocWatcher} from './watcher';

export class NgDocBuilder {
	readonly entities: NgDocEntityStore = new NgDocEntityStore();
	readonly skeleton: NgDocSkeletonEntity = new NgDocSkeletonEntity(this, this.context);
	private readonly project: Project;
	private readonly watcher: NgDocWatcher;

	constructor(readonly context: NgDocBuilderContext) {
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
				])
				.flat(),
		);
	}

	run(): Observable<void> {
		console.time('Build');
		const entities: Observable<NgDocEntity[]> = merge(
			entityLifeCycle(this, this.project, this.watcher, PAGE_PATTERN, NgDocPageEntity),
			entityLifeCycle(this, this.project, this.watcher, CATEGORY_PATTERN, NgDocCategoryEntity),
			entityLifeCycle(this, this.project, this.watcher, PAGE_DEPENDENCY_PATTERN, NgDocDependenciesEntity),
			entityLifeCycle(this, this.project, this.watcher, API_PATTERN, NgDocApiEntity),
		).pipe(
			bufferUntilOnce(this.watcher.onReady()),
			map((entities: NgDocEntity[][]) => entities.flat()),
		);

		return entities.pipe(
			tap(() => this.context.context.reportRunning()),
			mergeMap((entities: NgDocEntity[]) => {
				/*
					Refresh and compile source files for all not destroyed entities
				*/
				return forkJoin(
					entities.map((entity: NgDocEntity) => (entity.destroyed ? of(null) : entity.emit())),
				).pipe(mapTo(entities));
			}),
			switchMap((entities: NgDocEntity[]) => from(this.project.emit()).pipe(mapTo(entities))),
			mergeMap((entities: NgDocEntity[]) => {
				// Re-fetch compiled data for non destroyed entities
				return forkJoin(
					entities.map((entity: NgDocEntity) =>
						entity.destroyed
							? of(entity)
							: entity.update().pipe(
									catchError((e: Error) => {
										this.context.context.logger.error(`\n\nNgDoc error: ${e.message}\n${e.stack}`);

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
				);
			}),
			bufferDebounce(0),
			tap(() => this.entities.updateKeywordMap(this.context.options.ngDoc.keywords)),
			// Build touched entities and their dependencies
			mergeMap((entities: NgDocEntity[]) =>
				forkJoin(
					buildCandidates(entities).map((entity: NgDocEntity) =>
						entity.destroyed ? of([]) : entity.buildArtifacts(),
					),
				).pipe(
					switchMap((output: NgDocBuiltOutput[][]) =>
						this.skeleton
							.buildArtifacts()
							.pipe(map((skeleton: NgDocBuiltOutput[]) => [...output.flat(), ...skeleton])),
					),
					tap((output: NgDocBuiltOutput[]) => {
						/*
							We emit files and only after that delete destroyed ones, because otherwise
							angular compiler can raise an error that these items are not exist
						 */
						emitBuiltOutput(...output);
						this.collectGarbage();
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
}
