import {defer, Observable, OperatorFunction} from 'rxjs';
import {map, switchMap, tap} from 'rxjs/operators';

/**
 *
 * @param until
 */
export function bufferUntil<T>(until: Observable<unknown>): OperatorFunction<T, T[]> {
	return (source: Observable<T>) =>
		defer(() => {
			let buffer: T[] = [];
			return source.pipe(
				tap((v: T) => buffer.push(v)),
				switchMap(() => until.pipe(map(() => buffer))),
				tap(() => (buffer = [])),
			);
		});
}
