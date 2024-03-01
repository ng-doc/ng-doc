import { EMPTY, of, OperatorFunction } from 'rxjs';
import { tap } from 'rxjs/operators';

import { createCache, isCacheValid, loadCache, updateCache } from '../../entities/cache';
import { BuilderDone, BuilderState, CacheStrategy, isBuilderDone } from '../types';
import { isColdStart } from '../variables';

/**
 * Handles cache provided cache strategy.
 * It will skip or restore the builder based on the strategy on the first run and
 * update the cache on every next run.
 * @param strategy - Cache strategy
 */
export function handleCacheStrategy<T, TData>(
  strategy?: CacheStrategy<TData, T>,
): OperatorFunction<BuilderState<T>, BuilderState<T>> {
  return (source) => {
    if (!strategy) return source;

    const cache = createCache(undefined, strategy.files?.(), strategy.getData?.() ?? {});

    const sourceWithCache = source.pipe(
      tap((state) => {
        if (isBuilderDone(state)) {
          updateCache(
            strategy.id,
            createCache(
              undefined,
              strategy.files?.(),
              strategy.getData?.() ?? {},
              strategy.action === 'restore' ? strategy.saveResult(state.result) : undefined,
            ),
          );
        }
      }),
    );

    switch (strategy.action) {
      case 'skip':
        if (cache && isColdStart() && isCacheValid(strategy.id, cache)) {
          const cache = loadCache<TData>(strategy.id);

          strategy.onCacheLoad?.(cache.data as TData);

          return EMPTY;
        }

        return sourceWithCache;
      case 'restore':
        // Restore from cache if it's a first run
        if (cache && isColdStart() && isCacheValid(strategy.id, cache)) {
          const cache = loadCache<TData>(strategy.id);

          strategy.onCacheLoad?.(cache.data as TData);

          return of(
            new BuilderDone(strategy.id, strategy.restoreResult(cache.result ?? '') as T, true),
          );
        }

        return sourceWithCache;
      default:
        return source;
    }
  };
}
