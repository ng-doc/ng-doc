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
 *
 * @param builder
 * @param project
 * @param watcher
 * @param path
 * @param EntityConstructor
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
			forkJoinOrEmpty(entities.map((entity: NgDocEntity) => childGenerator(entity, watcher))).pipe(
				map((entities: NgDocEntity[][]) => entities.flat()),
			),
		),
	);
}

/**
 *
 * @param entity
 * @param watcher
 */
function childGenerator(entity: NgDocEntity, watcher: NgDocWatcher): Observable<NgDocEntity[]> {
	return entity.childrenGenerator().pipe(
		progress('Loading entities...'),
		switchMap((children: NgDocEntity[]) =>
			forkJoinOrEmpty(children.map((child: NgDocEntity) => childGenerator(child, watcher))),
		),
		map((children: NgDocEntity[][]) => [entity, children].flat(2)),
		tap((entities: NgDocEntity[]) => entities.forEach((e: NgDocEntity) => entity.builder.entities.set(e.id, e))),
	);
}
