import {Observable, of, OperatorFunction} from 'rxjs';
import {catchError} from 'rxjs/operators';

import {printError} from '../helpers';

/**
 * Handles errors and prints them to the console.
 *
 * @param errorResult
 */
export function errorHandler<T, TError>(errorResult: TError): OperatorFunction<T, T | TError> {
	return (source: Observable<T>) => {
		return source.pipe(
			catchError((error: Error) => {
				printError(error);

				return of(errorResult);
			}),
		);
	};
}
