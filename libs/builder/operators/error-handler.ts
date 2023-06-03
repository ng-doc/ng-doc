import {Observable, of, OperatorFunction} from 'rxjs';
import {catchError} from 'rxjs/operators';

import {printError} from '../helpers';

/**
 * Handles errors and prints them to the console.
 *
 * @param errorResult - The result to return in case of an error.
 * @param print - Whether to print the error to the console.
 */
export function errorHandler<T, TError>(errorResult: TError, print?: boolean): OperatorFunction<T, T | TError> {
	return (source: Observable<T>) => {
		return source.pipe(
			catchError((error: Error) => {
				print && printError(String(error));

				return of(errorResult);
			}),
		);
	};
}
