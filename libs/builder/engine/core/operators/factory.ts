import { asArray } from '@ng-doc/core';
import {
	combineLatest,
	debounce,
	from,
	map,
	Observable,
	ObservableInputTuple,
	of,
	switchMap,
} from 'rxjs';
import { catchError, debounceTime } from 'rxjs/operators';

import {
	BuilderDone,
	BuilderError,
	BuilderPending,
	BuilderState,
	isBuilderError,
	isBuilderPending,
} from '../types';
import { distinctPending } from './distinct-pending';

/**
 * The factory function is used to create an Observable of BuilderState.
 * It takes an array of Observables of BuilderState and a function that returns a Promise.
 * The function combines the latest values from the Observables, checks for errors and pending states,
 * and then calls the provided function with the results of the successful Observables.
 * The result of the function is then mapped to a BuilderDone state.
 * @param builders - An array of Observables of BuilderState.
 * @param buildFn - A function that takes the results of the successful Observables and returns a Promise.
 * @returns An Observable of BuilderState.
 */
export function factory<T, R>(
	builders: readonly [...ObservableInputTuple<Array<BuilderState<T>>>],
	buildFn: (...args: T[]) => Promise<R> | R,
): Observable<BuilderState<R>> {
	return combineLatest(builders).pipe(
		/**
		 * Adds async boundary to the stream.
		 * This is needed to let the builders start working together.
		 * E.g. if we have 2 builders that work based on file changes, they need to emit pending state at the same time
		 * to let the factory know that they both will emit something.
		 */
		debounce((states) =>
			states.some(isBuilderPending) ? of(states) : of(states).pipe(debounceTime(0)),
		),
		switchMap((states: Array<BuilderState<T>>) => {
			/**
			 * If any of the states are pending, return an Observable of BuilderPending.
			 */
			if (states.some(isBuilderPending)) {
				return of(new BuilderPending());
			}

			const errors = states.filter(isBuilderError);

			/**
			 * If there are any errors in the states, return an Observable of BuilderError.
			 */
			if (errors.length) {
				return of(new BuilderError(asArray(...errors.map((error) => error.error))));
			}

			/**
			 * If there are no errors or pending states, call the provided function with the results of the successful states.
			 * The result of the function is then mapped to a BuilderDone state.
			 */
			const buildFnResult = buildFn(
				...(states as Array<BuilderDone<T>>).map((state) => state.result),
			);

			return (buildFnResult instanceof Promise ? from(buildFnResult) : of(buildFnResult)).pipe(
				map((result) => new BuilderDone(result)),
			);
		}),
		catchError((error: Error) => of(new BuilderError([error]))),
		/**
		 * Prevents emitting the pending state twice in a row.
		 * This can happen if builders start working asynchronously based on some trigger.
		 */
		distinctPending(),
	);
}
