import { Observable, ObservableInput, ObservedValueOf, of, OperatorFunction } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import { BuilderState, CacheStrategy } from '../types';
import { builderState } from './builder-state';
import { handleCacheStrategy } from './handle-cache-strategy';

/**
 *
 * @param tag
 * @param project
 * @param skipIf
 * @param cacheStrategy
 */
export function runBuild<T, O extends ObservableInput<any>>(
  tag: string,
  project: (value: T, index: number) => O,
  cacheStrategy?: CacheStrategy<any, ObservedValueOf<O>>,
): OperatorFunction<T, BuilderState<ObservedValueOf<O>>> {
  return (source: Observable<T>) =>
    source.pipe(
      switchMap((args: T) => {
        return of(args).pipe(
          switchMap(project),
          builderState(tag),
          handleCacheStrategy(cacheStrategy),
        );
      }),
    );
}
