import {forkJoin, Observable, ObservableInput, of} from 'rxjs';

/**
 *
 * @param sources
 */
export function forkJoinOrEmpty<T>(sources: Array<ObservableInput<T>>): Observable<T[]> {
	return sources.length ? forkJoin(sources) : of([] as T[]);
}
