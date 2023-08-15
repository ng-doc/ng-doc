import type {Observable, OperatorFunction} from 'rxjs';
import {of} from 'rxjs';
import {catchError, map, startWith, switchMap, tap} from 'rxjs/operators';

export type StatedObservable<T, E = Error> = Observable<ObservableState<T, E>>;

export interface ObservableState<T, E = Error> {
	result: T | null;
	error: E | null;
	pending: boolean;
}

/**
 *
 * @param retry
 */
export function observableState<T, E = Error>(
	retry?: Observable<unknown>,
): OperatorFunction<T, ObservableState<T, E>> {
	return (source: Observable<T>) => {
		let state: ObservableState<T, E> = {
			result: null,
			error: null,
			pending: false,
		};

		return (retry ? retry.pipe(startWith(null)) : of(null)).pipe(
			switchMap(() =>
				source.pipe(
					// Map result of observable
					map((result: T) => ({result, pending: false})),
					// Map error of observable
					catchError((error: E) => of({result: null, error, pending: false})),
					// Start from pending state and clear error
					startWith({error: null, pending: true}),
					// Merge the current state with new state
					tap(
						(updatedState: Partial<ObservableState<T, E>>) => (state = {...state, ...updatedState}),
					),
					map(() => state),
				),
			),
		);
	};
}
