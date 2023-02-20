import {isPresent} from '@ng-doc/core';
import * as esbuild from 'esbuild';
import * as fs from 'fs';
import * as path from 'path';
import {from, merge, Observable, of} from 'rxjs';
import {
	catchError,
	concatMap,
	finalize,
	map,
	mapTo,
	mergeMap,
	share,
	startWith,
	switchMap,
	takeUntil,
	tap,
} from 'rxjs/operators';
import {Project, SourceFile} from 'ts-morph';

import {createProject, emitBuiltOutput, isFileEntity} from '../helpers';
import {NgDocBuilderContext, NgDocBuiltOutput} from '../interfaces';
import {bufferDebounce} from '../operators';
import {bufferUntilOnce} from '../operators/buffer-until-once';
import {forkJoinOrEmpty} from '../operators/fork-join-or-empty';
import {
	NgDocApiEntity,
	NgDocCategoryEntity,
	NgDocDependenciesEntity,
	NgDocPageEntity,
	NgDocSkeletonEntity,
} from './entities';
import {NgDocEntity} from './entities/abstractions/entity';
import {NgDocFileEntity} from './entities/abstractions/file.entity';
import {entityLifeCycle} from './entity-life-cycle';
import {NgDocEntityStore} from './entity-store';
import {buildCandidates} from './functions/build-candidates';
import {NgDocRenderer} from './renderer';
import {API_PATTERN, CACHE_PATH, CATEGORY_PATTERN, PAGE_DEPENDENCY_PATTERN, PAGE_PATTERN} from './variables';
import {NgDocWatcher} from './watcher';

export class NgDocBuilder {
	readonly entities: NgDocEntityStore = new NgDocEntityStore();
	readonly skeleton: NgDocSkeletonEntity = new NgDocSkeletonEntity(this, this.context);
	readonly renderer: NgDocRenderer = new NgDocRenderer();
	readonly project: Project;

	constructor(readonly context: NgDocBuilderContext) {
		this.project = createProject({tsConfigFilePath: this.context.tsConfig});
	}

	run(): Observable<void> {
		fs.rmSync(this.context.buildPath, {recursive: true, force: true});

		const watcher: NgDocWatcher = new NgDocWatcher(
			this.context.pagesPaths
				.map((pagesPath: string) => [
					path.join(pagesPath, PAGE_PATTERN),
					path.join(pagesPath, CATEGORY_PATTERN),
					path.join(pagesPath, PAGE_DEPENDENCY_PATTERN),
					path.join(pagesPath, API_PATTERN),
				])
				.flat(),
		);

		const entities: Observable<NgDocEntity[]> = merge(
			entityLifeCycle(this, this.project, watcher, PAGE_PATTERN, NgDocPageEntity),
			entityLifeCycle(this, this.project, watcher, CATEGORY_PATTERN, NgDocCategoryEntity),
			entityLifeCycle(this, this.project, watcher, PAGE_DEPENDENCY_PATTERN, NgDocDependenciesEntity),
			entityLifeCycle(this, this.project, watcher, API_PATTERN, NgDocApiEntity),
		).pipe(
			bufferUntilOnce(watcher.onReady()),
			map((entities: NgDocEntity[][]) => entities.flat()),
			bufferDebounce(100),
			map((entities: NgDocEntity[][]) => entities.flat()),
			share(),
		);

		return entities.pipe(
			tap(() => this.context.context.reportRunning()),
			mergeMap((entities: NgDocEntity[]) => {
				/*
					Refresh and compile source files for all not destroyed entities
				*/
				return forkJoinOrEmpty(
					entities.map((entity: NgDocEntity) => (entity.destroyed ? of(null) : entity.emit())),
				).pipe(mapTo(entities));
			}),
			concatMap((entities: NgDocEntity[]) => this.emit().pipe(mapTo(entities))),
			mergeMap((entities: NgDocEntity[]) => {
				// Re-fetch compiled data for non destroyed entities
				return forkJoinOrEmpty(
					entities.map((entity: NgDocEntity) =>
						entity.destroyed
							? of(entity)
							: /*
								TODO: If we run update method for entity, then before that, we need to add all entities
								 that depend on it via keyword to `buildCandidates` to force links updates
							 */
							  entity.update().pipe(
									catchError((e: Error) => {
										this.context.context.logger.error(`\n\nNgDoc error: ${e.message}\n${e.stack}`);

										return of(void 0);
									}),
									mapTo(entity),
							  ),
					),
				).pipe(
					switchMap((entities: NgDocEntity[]) =>
						entities.length
							? merge(
									...entities.map((entity: NgDocEntity) =>
										// Watch for dependency changes of non-destroyed entities
										entity.destroyed
											? of(entity)
											: entity.dependencies.changes().pipe(
													switchMap((dependencies: string[]) =>
														watcher
															.watch(dependencies)
															.onChange(...dependencies)
															.pipe(tap(() => entity.dependenciesChanged())),
													),
													startWith(null),
													mapTo(entity),
													takeUntil(
														merge(
															entity.onDestroy(),
															watcher.onChange(...entity.rootFiles),
														),
													),
											  ),
									),
							  )
							: of(null),
					),
				);
			}),
			bufferDebounce(500),
			map((entities: Array<NgDocEntity | null>) => entities.filter(isPresent)),
			tap(() => this.entities.updateKeywordMap(this.context.options.ngDoc?.keywords)),
			// Build touched entities and their dependencies
			concatMap((entities: NgDocEntity[]) =>
				forkJoinOrEmpty(
					buildCandidates(entities).map((entity: NgDocEntity) => {
						return entity.destroyed ? of([]) : entity.buildArtifacts();
					}),
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
			finalize(() => watcher.close()),
		) as unknown as Observable<void>;
	}

	get(id: string, canBeBuilt?: boolean): NgDocEntity | undefined {
		const entity: NgDocEntity | undefined = this.entities.get(id);

		return isPresent(canBeBuilt) ? (entity?.canBeBuilt === canBeBuilt ? entity : undefined) : entity;
	}

	emit(...only: SourceFile[]): Observable<void> {
		return from(
			esbuild.build({
				entryPoints: (only.length
					? only
					: this.entities
							.asArray()
							.filter(isFileEntity)
							.filter((e: NgDocFileEntity<unknown>) => e.compilable)
							.map((e: NgDocFileEntity<unknown>) => e.sourceFile)
				).map((s: SourceFile) => s.getFilePath()),
				tsconfig: this.context.tsConfig,
				bundle: true,
				format: 'cjs',
				treeShaking: true,
				outbase: this.context.context.workspaceRoot,
				outdir: CACHE_PATH,
			}),
		).pipe(mapTo(void 0));
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
