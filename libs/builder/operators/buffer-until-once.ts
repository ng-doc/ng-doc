import {Observable, OperatorFunction} from 'rxjs';
import {map, shareReplay, startWith, switchMap, tap} from 'rxjs/operators';

/**
 *
 * @param until
 */
export function bufferUntilOnce<T>(until: Observable<unknown>): OperatorFunction<T, T[]> {
	let buffer: T[] = [];
	const sharedUntil: Observable<unknown> = until.pipe(shareReplay(1));

	return (source: Observable<T>) =>
		source.pipe(
			tap((v: T) => buffer.push(v)),
			startWith(null),
			switchMap(() =>
				sharedUntil.pipe(
					map(() => buffer),
					tap(() => (buffer = [])),
				),
			),
		);
}
