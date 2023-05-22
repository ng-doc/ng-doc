import {merge, Observable, of} from 'rxjs';
import {map, mergeMap, startWith, switchMap, take, takeUntil, tap} from 'rxjs/operators';
import {Project} from 'ts-morph';

import {progress} from '../operators';
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
		progress(`Collecting entities...`),
		map((p: string) => new EntityConstructor(builder, project.addSourceFileAtPath(p), builder.context)),
		mergeMap((entity: NgDocEntity) => childGenerator(entity, watcher)),
	);
}

/**
 *
 * @param entity
 * @param watcher
 */
function childGenerator(entity: NgDocEntity, watcher: NgDocWatcher): Observable<NgDocEntity[]> {
	return merge(
		watcher
			.watch(entity.rootFiles)
			.onChange(...entity.rootFiles)
			.pipe(takeUntil(entity.onDestroy())),
		watcher.onUnlink(...entity.rootFiles).pipe(
			tap(() => entity.destroy()),
			take(1),
		),
	).pipe(
		startWith(entity),
		switchMap(() =>
			entity.destroyed
				? of([entity])
				: entity.childrenGenerator().pipe(
						switchMap((children: NgDocEntity[]) =>
							children.length
								? merge(...children.map((child: NgDocEntity) => childGenerator(child, watcher)))
								: of([]),
						),
						map((children: NgDocEntity[]) => [entity, ...children]),
						tap((entities: NgDocEntity[]) =>
							entities.forEach((e: NgDocEntity) => entity.builder.entities.set(e.id, e)),
						),
				  ),
		),
	);
}
