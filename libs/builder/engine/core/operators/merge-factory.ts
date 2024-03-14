import { from, merge, Observable, ObservableInputTuple, of, switchMap } from 'rxjs';
import { map } from 'rxjs/operators';

import {
  BuilderDone,
  BuilderState,
  BuilderStateTuple,
  CacheStrategy,
  isBuilderDone,
} from '../types';
import { builderState } from './builder-state';
import { handleCacheStrategy } from './handle-cache-strategy';

let builderId: number = 0;

/**
 * This function merges multiple observables and applies a project function when all observables are done.
 * It returns an Observable that emits either the value of type A[number] or a BuilderState<T>.
 * @param tag - A string representing the tag.
 * @param sources - An array of Observables.
 * @param project - A function that takes an array of BuilderState<R> and returns a Promise<T>.
 * @param cacheStrategy - An optional parameter that defines the cache strategy.
 * @param mapper
 * @returns An Observable that emits either the value of type A[number] or a BuilderState<T>.
 */
export function mergeFactory<TCacheData, A extends ReadonlyArray<BuilderState<unknown>>, T, M>(
  tag: string,
  sources: [...ObservableInputTuple<A>],
  project: (...args: [...BuilderStateTuple<A>]) => Promise<T>,
  cacheStrategy: CacheStrategy<TCacheData, T>,
  mapper: (source: [...BuilderStateTuple<A>][number]) => M,
): Observable<BuilderState<T | M>>;
export function mergeFactory<TCacheData, A extends ReadonlyArray<BuilderState<unknown>>, T>(
  tag: string,
  sources: [...ObservableInputTuple<A>],
  project: (...args: [...BuilderStateTuple<A>]) => Promise<T>,
  cacheStrategy?: CacheStrategy<TCacheData, T>,
): Observable<A[number] | BuilderState<T>>;
/**
 *
 * @param tag
 * @param sources
 * @param project
 * @param cacheStrategy
 * @param mapper
 */
export function mergeFactory<TCacheData, A extends ReadonlyArray<BuilderState<unknown>>, T, M>(
  tag: string,
  sources: [...ObservableInputTuple<A>],
  project: (...args: [...BuilderStateTuple<A>]) => Promise<T>,
  cacheStrategy?: CacheStrategy<TCacheData, T>,
  mapper?: (source: [...BuilderStateTuple<A>][number]) => M,
): Observable<A[number] | BuilderState<T | M>> {
  const id = builderId++;
  const buffer: Array<BuilderState<unknown>> = new Array(sources.length);

  return merge(
    ...sources.map((source, i) => from(source).pipe(map((value) => [i, value] as const))),
  ).pipe(
    switchMap(([i, value]) => {
      buffer[i] = value;
      const valueMapper = () => {
        if (!mapper || !isBuilderDone(value)) {
          return value;
        }

        return new BuilderDone(
          tag,
          mapper(value.result as [...BuilderStateTuple<A>][number]),
          value.fromCache,
        );
      };
      const mappedValue = valueMapper();

      if (buffer.every(isBuilderDone)) {
        const results = buffer.map(({ result }) => result) as [...BuilderStateTuple<A>];
        const buildFn = from(project(...results)).pipe(
          builderState(tag),
          handleCacheStrategy<T, TCacheData>(
            id,
            cacheStrategy,
            buffer.every(({ fromCache }) => fromCache),
          ),
        );

        return merge(of(mappedValue), buildFn);
      }

      return of(mappedValue);
    }),
  );
}
