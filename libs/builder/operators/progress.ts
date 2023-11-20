import { Observable, OperatorFunction } from 'rxjs';
import { tap } from 'rxjs/operators';

import { printProgress } from '../helpers';

/**
 * Prints a progress message. If no message is passed, the message will be cleared.
 * @param args - Arguments to pass to the `printProgress` function.
 */
export function progress<T>(...args: Parameters<typeof printProgress>): OperatorFunction<T, T> {
	return (source: Observable<T>) => source.pipe(tap(() => printProgress(...args)));
}
