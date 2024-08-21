import { asArray } from '@ng-doc/core';
import { combineLatest, from, map, ObservableInputTuple, of, switchMap } from 'rxjs';
import { catchError } from 'rxjs/operators';

import {
  Builder,
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
import { addToStack } from './stack';

let builderId: number = 0;

/**
 * The factory function is a powerful tool for creating complex builders.
 * It should be used when you need to build something based on the results of multiple other builders.
 * @param tag - A string that identifies the builder.
 * @param builders - An array of Observables of BuilderState.
 * @param buildFn - A function that takes the results of the successful Observables and returns a Promise.
 * @param cacheStrategy - An optional CacheStrategy object.
 * @returns An Observable of BuilderState.
 */
export function factory<T, R, TCacheData>(
  tag: string,
  builders: readonly [...ObservableInputTuple<Array<BuilderState<T>>>],
  buildFn: (...args: T[]) => Promise<R> | R,
  cacheStrategy?: CacheStrategy<TCacheData, R>,
): Builder<R> {
  const id = builderId++;

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

      /**
       * We don't use ObservableInput here because it opens the door to passing an Observable
       * as the result of the build function which might break the cache strategy, and final state.
       */
      return from(Promise.resolve(buildFnResult)).pipe(
        map((result) => new BuilderDone(tag, result)),
        catchError((error: Error) => of(new BuilderError(tag, [error]))),
        handleCacheStrategy<R, TCacheData>(
          `factory${id}`,
          cacheStrategy,
          (states as Array<BuilderDone<T>>).every(({ fromCache }) => fromCache),
        ),
      );
    }),
    /**
     * Prevents emitting the pending state twice in a row.
     * This can happen if builders start working asynchronously based on some trigger.
     */
    distinctPending(),
    addToStack(tag),
  );
}
