import {Observable, OperatorFunction} from 'rxjs';
import {tap} from 'rxjs/operators';

import {printProgress} from '../helpers';

/**
 * Prints a progress message. If no message is passed, the message will be cleared.
 *
 * @param message - The message to print.
 */
export function progress<T>(message?: string): OperatorFunction<T, T> {
	return (source: Observable<T>) => source.pipe(tap(() => printProgress(message)));
}
