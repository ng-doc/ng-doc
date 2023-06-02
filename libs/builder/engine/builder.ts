import {isPresent} from '@ng-doc/core';
import * as fs from 'fs';
import * as path from 'path';
import {mergeMap, Observable, of} from 'rxjs';
import {catchError, map} from 'rxjs/operators';
import {Project} from 'ts-morph';

import {createProject, printProgress} from '../helpers';
import {NgDocBuilderContext} from '../interfaces';
import {progress} from '../operators';
import {build, collectGarbage, compile, emit, load, refresh} from './builder-operators';
import {dependencyChanges} from './builder-operators/dependency-changes';
import {task, taskForMany} from './builder-operators/task';
import {NgDocSkeletonEntity} from './entities';
import {NgDocEntity} from './entities/abstractions/entity';
import {invalidateCacheIfNeeded, NgDocCache} from './entities/cache';
import {NgDocIndexesEntity} from './entities/indexes.entity';
import {entityEmitter} from './entity-emitter';
import {NgDocEntityStore} from './entity-store';
import {API_PATTERN, CATEGORY_PATTERN, GLOBALS, PAGE_PATTERN} from './variables';
import {NgDocWatcher} from './watcher';

export class NgDocBuilder {
	readonly entities: NgDocEntityStore = new NgDocEntityStore();
	readonly skeleton: NgDocSkeletonEntity = new NgDocSkeletonEntity(this, this.context);
	readonly indexes: NgDocIndexesEntity = new NgDocIndexesEntity(this, this.context);
	readonly cache: NgDocCache = new NgDocCache(!!this.context.config?.cache);
	readonly project: Project;

	constructor(readonly context: NgDocBuilderContext) {
		this.project = createProject({tsConfigFilePath: this.context.tsConfig});
		GLOBALS.workspaceRoot = this.context.context.workspaceRoot;
	}

	run(): Observable<void> {
		printProgress('Initializing...');
		const ifNotDestroyed = (entity: NgDocEntity) => !entity.destroyed;
		const ifNotCached = (entity: NgDocEntity) => ifNotDestroyed(entity) && !this.cache.isCacheValid(entity);

		if (this.context.config?.cache && invalidateCacheIfNeeded(this.context.cachedFiles)) {
			// do nothing
		} else {
			fs.rmSync(this.context.buildPath, {recursive: true, force: true});
		}

		const watcher: NgDocWatcher = new NgDocWatcher(
			this.context.pagesPaths
				.map((pagesPath: string) => [
					path.join(pagesPath, PAGE_PATTERN),
					path.join(pagesPath, CATEGORY_PATTERN),
					path.join(pagesPath, API_PATTERN),
				])
				.flat(),
		);

		return entityEmitter(this, this.project, watcher).pipe(
			mergeMap((entities: NgDocEntity[]) =>
				of(entities).pipe(
					task('Updating source files...', refresh(), ifNotDestroyed),
					task('Compiling...', compile(this.context.tsConfig, this.context.context.workspaceRoot), ifNotDestroyed),
					task('Loading...', load(), ifNotDestroyed),
					dependencyChanges(watcher),
					taskForMany(
						'Building...',
						build(this.entities, this.context.config, this.skeleton, this.indexes),
						ifNotCached,
					),
					taskForMany('Emitting...', emit()),
					collectGarbage(this.entities),
					catchError((e: Error) => {
						console.error(e);

						return of(void 0);
					}),
				),
			),
			map(() => void 0),
			progress(),
		);
	}

	get(id: string, canBeBuilt?: boolean): NgDocEntity | undefined {
		const entity: NgDocEntity | undefined = this.entities.get(id);

		return isPresent(canBeBuilt) ? (entity?.canBeBuilt === canBeBuilt ? entity : undefined) : entity;
	}
}
