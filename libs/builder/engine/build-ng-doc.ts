import * as fs from 'fs';
import * as path from 'path';
import {combineLatestWith, finalize, from, mergeMap, Observable, of} from 'rxjs';
import {map, tap} from 'rxjs/operators';
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
import {postBuild} from './builder-operators/post-build';
import {postProcess} from './builder-operators/post-process';
import {printOutput} from './builder-operators/print-output';
import {task, taskForMany} from './builder-operators/task';
import {toBuilderOutput} from './builder-operators/to-builder-output';
import {
	NgDocContextEntity,
	NgDocIndexFileEntity,
	NgDocKeywordsEntity,
	NgDocRoutesEntity,
} from './entities';
import {NgDocEntity} from './entities/abstractions/entity';
import {invalidateCacheIfNeeded, NgDocCache} from './entities/cache';
import {NgDocIndexesEntity} from './entities/indexes.entity';
import {entityEmitter} from './entity-emitter';
import {NgDocEntityStore} from './entity-store';
import {ifNotCachedOrInvalid} from './functions';
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

	const store: NgDocEntityStore = new NgDocEntityStore(context.config);
	const cache: NgDocCache = new NgDocCache(!!context.config?.cache);
	const project: Project = createProject({tsConfigFilePath: context.tsConfig});

	// Global entities that should be built after each build cycle
	const globalEntities = [
		new NgDocContextEntity(store, cache, context),
		new NgDocIndexFileEntity(store, cache, context),
		new NgDocRoutesEntity(store, cache, context),
	];

	const indexesEntity: NgDocIndexesEntity = new NgDocIndexesEntity(store, cache, context);
	const keywordEntity: NgDocKeywordsEntity = new NgDocKeywordsEntity(store, cache, context);

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
		combineLatestWith(from(store.loadGlobalKeywords())),
		map(([entities]) => entities),
		mergeMap((entities: NgDocEntity[]) =>
			of(entities).pipe(
				task('Updating source files...', refresh()),
				taskForMany('Collecting affected files...', addBuildCandidates(store)),
				task('Compiling...', compile()),
				task('Loading...', load()),
				dependencyChanges(watcher),
				tap(() => store.updateKeywordMap()),
				taskForMany('Building...', build(store, ...globalEntities), ifNotCachedOrInvalid(cache, store)),
				taskForMany('Post-build...', postBuild()),
				taskForMany('Post-processing...', postProcess(store, context.config, indexesEntity, keywordEntity)),
				taskForMany(undefined, toBuilderOutput()),
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
