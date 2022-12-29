import {forkJoin, merge, Observable, of} from 'rxjs';
import {concatMap, map, mergeMap, startWith, take, takeUntil, tap} from 'rxjs/operators';
import {Project} from 'ts-morph';

import {Constructable} from '../types';
import {NgDocBuilder} from './builder';
import {NgDocEntity} from './entities/abstractions/entity';
import {NgDocWatcher} from './watcher';

/**
 *
 * @param builder
 * @param project
 * @param watcher
 * @param path
 * @param EntityConstructor
 */
export function entityLifeCycle(
	builder: NgDocBuilder,
	project: Project,
	watcher: NgDocWatcher,
	path: string,
	EntityConstructor: Constructable<NgDocEntity>,
): Observable<NgDocEntity[]> {
	return watcher.onAdd(path).pipe(
		map((p: string) => new EntityConstructor(builder, project.addSourceFileAtPath(p), builder.context)),
		mergeMap((entity: NgDocEntity) =>
			childGenerator(entity).pipe(
				concatMap((entities: NgDocEntity[]) =>
					merge(
						...entities.map((entity: NgDocEntity) =>
							merge(
								watcher
									.watch(entity.rootFiles)
									.onChange(...entity.rootFiles)
									.pipe(
										concatMap(() => childGenerator(entity)),
										takeUntil(entity.onDestroy()),
									),
								watcher.onUnlink(...entity.rootFiles).pipe(
									tap(() => entity.destroy()),
									take(1),
									map(() => [entity]),
								),
							),
						),
					).pipe(startWith(entities)),
				),
			),
		),
	);
}

/**
 *
 * @param entity
 */
function childGenerator(entity: NgDocEntity): Observable<NgDocEntity[]> {
	return entity.childrenGenerator().pipe(
		concatMap((entities: NgDocEntity[]) =>
			!entities.length
				? of([entity])
				: forkJoin(entities.map((e: NgDocEntity) => childGenerator(e))).pipe(
						map((children: NgDocEntity[][]) => [entity, ...children.flat()]),
				  ),
		),
		tap((entities: NgDocEntity[]) => entities.forEach((e: NgDocEntity) => entity.builder.entities.set(e.id, e))),
	);
}
