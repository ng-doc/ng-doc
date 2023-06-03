import * as fs from 'fs';
import * as path from 'path';
import {mergeMap, Observable, of} from 'rxjs';
import {map} from 'rxjs/operators';
import {Project} from 'ts-morph';

import {createProject, printProgress} from '../helpers';
import {NgDocBuilderContext} from '../interfaces';
import {progress} from '../operators';
import {build, collectGarbage, compile, emit, load, refresh} from './builder-operators';
import {dependencyChanges} from './builder-operators/dependency-changes';
import {printOutput} from './builder-operators/print-output';
import {task, taskForMany} from './builder-operators/task';
import {NgDocSkeletonEntity} from './entities';
import {NgDocEntity} from './entities/abstractions/entity';
import {invalidateCacheIfNeeded, NgDocCache} from './entities/cache';
import {NgDocIndexesEntity} from './entities/indexes.entity';
import {entityEmitter} from './entity-emitter';
import {NgDocEntityStore} from './entity-store';
import {API_PATTERN, CATEGORY_PATTERN, GLOBALS, PAGE_PATTERN} from './variables';
import {NgDocWatcher} from './watcher';

/**
 * Builds the documentation and emits files to the file system,
 * based on the changes in the source files.
 *
 * @param context - The builder context.
 */
export function buildNgDoc(context: NgDocBuilderContext): Observable<void> {
	printProgress('Initializing...');

	// Set global variables
	GLOBALS.workspaceRoot = context.context.workspaceRoot;

	const store: NgDocEntityStore = new NgDocEntityStore();
	const cache: NgDocCache = new NgDocCache(!!context.config?.cache);
	const project: Project = createProject({tsConfigFilePath: context.tsConfig});

	// Global entities that should be built after each build cycle
	const globalEntities: NgDocEntity[] = [
		new NgDocSkeletonEntity(store, cache, context),
		new NgDocIndexesEntity(store, cache, context),
	];

	// Filters for tasks
	const ifNotDestroyed = (entity: NgDocEntity) => !entity.destroyed;
	const isReadyForBuild = (entity: NgDocEntity) => entity.isReadyForBuild;
	const ifNotCached = (entity: NgDocEntity) => isReadyForBuild(entity) && !cache.isCacheValid(entity);

	// Clean build path if cache is not enabled
	if (!!context.config?.cache && invalidateCacheIfNeeded(context.cachedFiles)) {
		// do nothing
	} else {
		fs.rmSync(context.buildPath, {recursive: true, force: true});
	}

	// Watch for changes in pages
	const watcher: NgDocWatcher = new NgDocWatcher(
		context.pagesPaths
			.map((pagesPath: string) => [
				path.join(pagesPath, PAGE_PATTERN),
				path.join(pagesPath, CATEGORY_PATTERN),
				path.join(pagesPath, API_PATTERN),
			])
			.flat(),
	);

	// The main build cycle
	return entityEmitter(store, cache, context, project, watcher).pipe(
		mergeMap((entities: NgDocEntity[]) =>
			of(entities).pipe(
				task('Updating source files...', refresh(), ifNotDestroyed),
				task('Compiling...', compile(), isReadyForBuild),
				task('Loading...', load(), isReadyForBuild),
				dependencyChanges(watcher),
				taskForMany('Building...', build(store, context.config, ...globalEntities), ifNotCached),
				taskForMany('Emitting...', emit()),
				collectGarbage(store),
			),
		),
		printOutput(store),
		map(() => void 0),
		progress(),
	);
}
