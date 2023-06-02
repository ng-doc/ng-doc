import {mergeMap, of, OperatorFunction} from 'rxjs';

import {forkJoinOrEmpty, progress} from '../../operators';
import {errorHandler} from '../../operators/error-handler';

/**
 * Task operator that runs the provided operator on each value of the source.
 * It also filters the values if the filter function is provided, shows the progress and handles the errors.
 *
 * @param name - The name of the task (for progress).
 * @param operator - The operator to run on each value of the source.
 * @param filter - The filter function to filter the values of the source.
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
 * Task operator that runs the provided operator on the source with all the values.
 * It also filters the values if the filter function is provided, shows the progress and handles the errors.
 *
 * @param name - The name of the task (for progress).
 * @param operator - The operator to run on the source.
 * @param filter - The filter function to filter the values of the source.
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
