import {Observable, OperatorFunction} from 'rxjs';
import {debounceTime, map, tap} from 'rxjs/operators';

/**
 *
 * @param duration
 */
export function bufferDebounce<T>(duration: number): OperatorFunction<T, T[]> {
	return (source: Observable<T>) => {
		let buffer: T[] = [];

		return source.pipe(
			tap((value: T) => buffer.push(value)),
			debounceTime(duration),
			map(() => buffer),
			tap(() => (buffer = [])),
		);
	};
}
