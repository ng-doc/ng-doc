import {NgDocWatcher} from './watcher';
import {Constructable} from '../types';
import {NgDocEntity} from './entities/abstractions/entity';
import {forkJoin, merge, Observable, of} from 'rxjs';
import {map, startWith, switchMap, take, takeUntil, tap} from 'rxjs/operators';
import {NgDocBuilder} from './builder';
import {Project} from 'ts-morph';

export function entityLifeCycle(
	builder: NgDocBuilder,
	project: Project,
	watcher: NgDocWatcher,
	path: string,
	EntityConstructor: Constructable<NgDocEntity>,
): Observable<NgDocEntity[]> {
	return watcher.onAdd(path).pipe(
		map((p: string) => new EntityConstructor(builder, project.addSourceFileAtPath(p), builder.context)),
		switchMap((entity: NgDocEntity) =>
			childGenerator(entity).pipe(
				switchMap((entities: NgDocEntity[]) =>
					merge(
						...entities.map((entity: NgDocEntity) =>
								merge(
									watcher.onChange(...entity.rootFiles)
										.pipe(
											switchMap(() => childGenerator(entity)),
											takeUntil(entity.onDestroy())
										),
									watcher.onUnlink(...entity.rootFiles).pipe(
										tap(() => entity.destroy()),
										take(1),
										map(() => [entity])
									),
								),
						),
					).pipe(startWith(entities)),
				),
			),
		),
	);
}

function childGenerator(entity: NgDocEntity): Observable<NgDocEntity[]> {
	entity.children.forEach((child: NgDocEntity) => child.destroy());

	return entity
		.childrenGenerator()
		.pipe(
			switchMap((entities: NgDocEntity[]) =>
				!entities.length
					? of([entity])
					: forkJoin(entities.map((e: NgDocEntity) => childGenerator(e))).pipe(
							map((children: NgDocEntity[][]) => [entity, ...children.flat()]),
					  ),
			),
			tap((entities: NgDocEntity[]) => entities.forEach((e: NgDocEntity) => entity.builder.entities.set(e.id, e)))
		);
}
