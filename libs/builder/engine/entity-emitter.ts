import {NgDocBuilderContext} from '@ng-doc/builder';
import {asArray} from '@ng-doc/core';
import {merge, Observable} from 'rxjs';
import {map, mergeMap, startWith, switchMap, take, tap} from 'rxjs/operators';
import {Project} from 'ts-morph';

import {getEntityConstructor} from '../helpers';
import {forkJoinOrEmpty, progress} from '../operators';
import {Constructable} from '../types';
import {NgDocEntity} from './entities/abstractions/entity';
import {NgDocCache} from './entities/cache';
import {NgDocEntityStore} from './entity-store';
import {API_PATTERN, CATEGORY_PATTERN, PAGE_PATTERN} from './variables';
import {NgDocWatcher} from './watcher';

/**
 * Emits new entities if they are added or changed. Also emits destroyed entities if their root files are unlinked.
 * This function not only creates the entities based on the file path, but also creates the child entities recursively
 * if it's can be done.
 *
 * @param store - The entity store.
 * @param cache - The cache instance.
 * @param context - The builder context.
 * @param project - The project instance.
 * @param watcher - The watcher instance.
 */
export function entityEmitter(
	store: NgDocEntityStore,
	cache: NgDocCache,
	context: NgDocBuilderContext,
	project: Project,
	watcher: NgDocWatcher,
): Observable<NgDocEntity[]> {
	return merge(
		watcher.onAdd(PAGE_PATTERN, CATEGORY_PATTERN, API_PATTERN),
		watcher.onChange(PAGE_PATTERN, CATEGORY_PATTERN, API_PATTERN),
	).pipe(
		map((paths: string[]) =>
			paths.map((p: string) => {
				const EntityConstructor: Constructable<NgDocEntity> = getEntityConstructor(p);

				return new EntityConstructor(store, cache, context, project.addSourceFileAtPath(p));
			}),
		),
		mergeMap((entities: NgDocEntity[]) =>
			merge(
				...entities.map((entity: NgDocEntity) =>
					merge(watcher.onUnlink(...entity.rootFiles), entity.onDestroy()).pipe(
						take(1),
						tap(() => entity.destroy()),
						map(() => [entity]),
					),
				),
			).pipe(startWith(entities)),
		),
		mergeMap((entities: NgDocEntity[]) =>
			forkJoinOrEmpty(entities.map(childGenerator)).pipe(map((entities: NgDocEntity[][]) => entities.flat())),
		),
		map((entities: NgDocEntity[]) =>
			// Add the entities with errors or warnings to the output.
			// This is necessary to try to build them again.
			asArray(new Set(entities.concat(store.getAllWithErrorsOrWarnings()))),
		),
	);
}

/**
 * Creates the child entities recursively.
 *
 * @param entity - The entity to create the children for.
 */
function childGenerator(entity: NgDocEntity): Observable<NgDocEntity[]> {
	return entity.childrenGenerator().pipe(
		progress('Loading entities...'),
		switchMap((children: NgDocEntity[]) => forkJoinOrEmpty(children.map(childGenerator))),
		map((children: NgDocEntity[][]) => [entity, children].flat(2)),
		tap((entities: NgDocEntity[]) => entities.forEach((e: NgDocEntity) => entity.store.set(e.id, e))),
	);
}
