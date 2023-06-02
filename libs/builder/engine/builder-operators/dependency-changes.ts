import {merge, mergeMap, Observable, of, OperatorFunction, switchMap, takeUntil} from 'rxjs';
import {map, startWith, tap} from 'rxjs/operators';

import {bufferDebounce} from '../../operators';
import {NgDocEntity} from '../entities/abstractions/entity';
import {NgDocWatcher} from '../watcher';

/**
 * Operator creates an additional observable that emits when the dependencies of the source observable change
 * and returns them as an array.
 *
 * @param watcher - The watcher instance.
 */
export function dependencyChanges(watcher: NgDocWatcher): OperatorFunction<NgDocEntity[], NgDocEntity[]> {
	return (source: Observable<NgDocEntity[]>) =>
		source.pipe(
			mergeMap((entities: NgDocEntity[]) => {
				const filtered: NgDocEntity[] = entities.filter((e: NgDocEntity) => !e.destroyed);

				return filtered.length
					? merge(
							...entities.map((e: NgDocEntity) =>
								e.dependencies.changes().pipe(
									switchMap((dependencies: string[]) =>
										watcher
											.watch(dependencies)
											.onChange(...dependencies)
											.pipe(
												tap(() => e.dependenciesChanged()),
												takeUntil(e.onDestroy()),
												map(() => e),
											),
									),
								),
							),
					  ).pipe(bufferDebounce(0), startWith(entities))
					: of(entities);
			}),
		);
}
