import * as fs from 'fs';
import * as path from 'path';
import {finalize, mergeMap, Observable, of} from 'rxjs';
import {map} from 'rxjs/operators';
import {Project} from 'ts-morph';

import {createProject, printProgress} from '../helpers';
import {NgDocBuilderContext} from '../interfaces';
import {progress} from '../operators';
import {
	addBuildCandidates,
	build,
	collectGarbage,
	compile,
	emit,
	load,
	refresh,
	updateCache,
} from './builder-operators';
import {dependencyChanges} from './builder-operators/dependency-changes';
import {postProcess} from './builder-operators/post-process';
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
	const skeletonEntity: NgDocSkeletonEntity = new NgDocSkeletonEntity(store, cache, context);
	const indexesEntity: NgDocIndexesEntity = new NgDocIndexesEntity(store, cache, context);

	// Filters for tasks
	const ifNotCached = (entity: NgDocEntity) => !cache.isCacheValid(entity);

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
				task('Updating source files...', refresh()),
				taskForMany('Collecting affected files...', addBuildCandidates(store)),
				task('Compiling...', compile()),
				task('Loading...', load()),
				dependencyChanges(watcher),
				taskForMany('Building...', build(store, context.config, skeletonEntity), ifNotCached),
				taskForMany('Post-processing...', postProcess(store, context.config, indexesEntity)),
				taskForMany('Emitting...', emit()),
				collectGarbage(store),
			),
		),
		updateCache(store),
		printOutput(store),
		map(() => void 0),
		finalize(() => watcher.close()),
		progress(),
	);
}
