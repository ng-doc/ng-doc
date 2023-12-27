import { Observable, ObservableInput, ObservedValueOf, of, OperatorFunction } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import { BuilderState, isBuilderDone } from '../types';
import { distinctPending } from './distinct-pending';

/**
 * Operator function that projects each source value to an Observable which is merged in the output Observable,
 * only if the source value is a BuilderDone state.
 *
 * The project function is applied to each value emitted by the source Observable. If the source value is a BuilderDone state,
 * the project function is called with the result of the BuilderDone state and the index as arguments, and the returned Observable
 * is merged into the output Observable. If the source value is not a BuilderDone state, it is emitted directly to the output Observable.
 * @param {Function} project - The function to apply to each BuilderDone value emitted by the source Observable.
 * @returns {OperatorFunction} - An OperatorFunction that emits the items from the source Observable or the projected Observables.
 */
export function whenDone<T, O extends ObservableInput<any>>(
	project: (value: T, index: number) => ObservableInput<BuilderState<ObservedValueOf<O>>>,
): OperatorFunction<BuilderState<T>, BuilderState<ObservedValueOf<O>>> {
	return (source: Observable<BuilderState<T>>) =>
		source.pipe(
			switchMap((state) => {
				if (isBuilderDone(state)) {
					return of(state.result).pipe(switchMap(project));
				}

				return of(state);
			}),
			distinctPending(),
		);
}
