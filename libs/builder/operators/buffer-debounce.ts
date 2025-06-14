import { Observable, OperatorFunction } from 'rxjs';
import { buffer, debounceTime, share } from 'rxjs/operators';

/**
 *
 * @param duration
 */
export function bufferDebounce<T>(duration: number): OperatorFunction<T, T[]> {
  return (source: Observable<T>) => {
    const sharedSource: Observable<T> = source.pipe(share());

    return sharedSource.pipe(buffer(sharedSource.pipe(debounceTime(duration))));
  };
}
