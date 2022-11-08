import {combineLatest, Observable, OperatorFunction} from 'rxjs';
import {mergeMap} from 'rxjs/operators';

/**
 *
 * @param pipeFn
 */
export function forEach<T, R>(pipeFn: (element: T) => Observable<R>): OperatorFunction<T[], R[]> {
	return (source: Observable<T[]>) =>
		source.pipe(mergeMap((array: T[]) => combineLatest(array.map(pipeFn))))
}
