import {mergeMap, of, OperatorFunction} from 'rxjs';

import {forkJoinOrEmpty, progress} from '../../operators';
import {errorHandler} from '../../operators/error-handler';

/**
 *
 * @param name
 * @param operator
 * @param filter
 */
export function task<T, R>(
	name: string,
	operator: OperatorFunction<T, R>,
	filter?: (value: T) => boolean,
): OperatorFunction<T[], R[]> {
	return (source) => {
		return source.pipe(
			progress(name),
			mergeMap((value) => {
				const filtered = filter ? value.filter(filter) : value;

				return forkJoinOrEmpty(filtered.map((v) => of(v).pipe(operator, errorHandler())));
			}),
		);
	};
}

/**
 *
 * @param name
 * @param operator
 * @param filter
 */
export function taskForMany<T, R>(
	name: string,
	operator: OperatorFunction<T[], R[]>,
	filter?: (value: T) => boolean,
): OperatorFunction<T[], R[]> {
	return (source) => {
		return source.pipe(
			progress(name),
			mergeMap((value) => {
				const filtered = filter ? value.filter(filter) : value;

				return of(filtered).pipe(operator, errorHandler());
			}),
		);
	};
}
