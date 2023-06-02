import {merge, Observable} from 'rxjs';
import {map, mergeMap, startWith, switchMap, take, tap} from 'rxjs/operators';
import {Project} from 'ts-morph';

import {getEntityConstructor} from '../helpers';
import {forkJoinOrEmpty, progress} from '../operators';
import {Constructable} from '../types';
import {NgDocBuilder} from './builder';
import {NgDocEntity} from './entities/abstractions/entity';
import {API_PATTERN, CATEGORY_PATTERN, PAGE_PATTERN} from './variables';
import {NgDocWatcher} from './watcher';

/**
 * Emits new entities if they are added or changed. Also emits destroyed entities if their root files are unlinked.
 * This function not only creates the entities based on the file path, but also creates the child entities recursively
 * if it's can be done.
 *
 * @param builder - The builder instance.
 * @param project - The project instance.
 * @param watcher - The watcher instance.
 */
export function entityEmitter(
	builder: NgDocBuilder,
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

				return new EntityConstructor(builder, project.addSourceFileAtPath(p), builder.context);
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
		tap((entities: NgDocEntity[]) => entities.forEach((e: NgDocEntity) => entity.builder.entities.set(e.id, e))),
	);
}
