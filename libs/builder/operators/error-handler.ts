import {EMPTY, Observable, OperatorFunction} from 'rxjs';
import {catchError} from 'rxjs/operators';

import {printError} from '../helpers';

/**
 * Handles errors and prints them to the console.
 */
export function errorHandler<T>(): OperatorFunction<T, T> {
	return (source: Observable<T>) => {
		return source.pipe(
			catchError((error: Error) => {
				printError(error);

				return EMPTY;
			}),
		);
	};
}
