import { asArray } from '@ng-doc/core';
import { combineLatest, from, map, Observable, ObservableInputTuple, of, switchMap } from 'rxjs';
import { catchError } from 'rxjs/operators';

import {
  BuilderDone,
  BuilderError,
  BuilderPending,
  BuilderState,
  CacheStrategy,
  isBuilderError,
  isBuilderPending,
} from '../types';
import { distinctPending } from './distinct-pending';
import { handleCacheStrategy } from './handle-cache-strategy';

/**
 * The factory function is a powerful tool for creating complex builders.
 * It should be used when you need to build something based on the results of multiple other builders.
 * @param tag
 * @param builders - An array of Observables of BuilderState.
 * @param buildFn - A function that takes the results of the successful Observables and returns a Promise.
 * @param cacheStrategy
 * @returns An Observable of BuilderState.
 */
export function factory<T, R, TCacheData>(
  tag: string,
  builders: readonly [...ObservableInputTuple<Array<BuilderState<T>>>],
  buildFn: (...args: T[]) => Promise<R> | R,
  cacheStrategy?: CacheStrategy<TCacheData, R>,
): Observable<BuilderState<R>> {
  return combineLatest(builders).pipe(
    switchMap((states: Array<BuilderState<T>>) => {
      /**
       * If any of the states are pending, return an Observable of BuilderPending.
       */
      if (states.some(isBuilderPending)) {
        return of(new BuilderPending(tag));
      }

      const errors = states.filter(isBuilderError);

      /**
       * If there are any errors in the states, return an Observable of BuilderError.
       */
      if (errors.length) {
        return of(new BuilderError(tag, asArray(...errors.map(({ error }) => error))));
      }

      /**
       * If there are no errors or pending states, call the provided function with the results of the successful states.
       * The result of the function is then mapped to a BuilderDone state.
       */
      const buildFnResult = buildFn(
        ...(states as Array<BuilderDone<T>>).map(({ result }) => result),
      );

      return (buildFnResult instanceof Promise ? from(buildFnResult) : of(buildFnResult)).pipe(
        map((result) => new BuilderDone(tag, result)),
        handleCacheStrategy<R, TCacheData>(cacheStrategy),
      );
    }),
    catchError((error: Error) => of(new BuilderError(tag, [error]))),
    /**
     * Prevents emitting the pending state twice in a row.
     * This can happen if builders start working asynchronously based on some trigger.
     */
    distinctPending(),
  );
}
