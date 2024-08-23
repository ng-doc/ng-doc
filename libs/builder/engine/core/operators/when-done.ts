import {
  combineLatest,
  Observable,
  ObservableInput,
  ObservableInputTuple,
  ObservedValueOf,
  of,
  OperatorFunction,
} from 'rxjs';
import { switchMap } from 'rxjs/operators';

import { BuilderDone, BuilderState, isBuilderDone } from '../types';
import { distinctPending } from './distinct-pending';
import { joinBuilderStates } from './join-builder-states';
import { addToStack } from './stack';

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
      // This will destroy the observable chain if the state is not a BuilderDone state
      switchMap((state) => {
        if (isBuilderDone(state)) {
          return of(state.result).pipe(switchMap(project));
        }

        return of(state);
      }),
      distinctPending(),
    );
}

/**
 *
 * @param tag
 * @param builders
 * @param project
 */
export function factoryChain<T, TChild>(
  tag: string,
  builders: readonly [...ObservableInputTuple<Array<BuilderState<T>>>],
  project: (...args: T[]) => readonly [...ObservableInputTuple<Array<BuilderState<TChild>>>],
): Observable<BuilderState<TChild>> {
  return combineLatest(builders).pipe(
    switchMap((states: Array<BuilderState<T>>) =>
      joinBuilderStates(tag, states, (...args) =>
        combineLatest(...project(...args)).pipe(
          switchMap((states: Array<BuilderState<TChild>>) =>
            joinBuilderStates(tag, states, (...args) =>
              of(...args.map((result) => new BuilderDone(tag, result))),
            ),
          ),
        ),
      ),
    ),
    distinctPending(),
    addToStack(tag),
  );
}
