import {Observable, OperatorFunction} from 'rxjs';
import {buffer, debounceTime} from 'rxjs/operators';

/**
 *
 * @param duration
 */
export function bufferDebounce<T>(duration: number): OperatorFunction<T, T[]> {
	return (source: Observable<T>) => {
		return source.pipe(buffer(source.pipe(debounceTime(duration))));
	};
}
