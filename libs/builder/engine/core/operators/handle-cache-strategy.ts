import { EMPTY, of, OperatorFunction } from 'rxjs';
import { tap } from 'rxjs/operators';

import { createCache, isCacheValid, loadCache, updateCache } from '../../cache';
import { BuilderDone, BuilderState, CacheStrategy, isBuilderDone } from '../types';
import { isColdStart } from '../variables';

let isCacheEnabled: boolean = true;

/**
 * Disables cache for all builders.
 */
export function disableCache(): void {
  isCacheEnabled = false;
}

const restoredBuilders = new Set<string>();

export const PENDING_CACHE: Array<() => void> = [];

/**
 * Handles cache provided cache strategy.
 * It will skip or restore the builder based on the strategy on the first run and
 * update the cache on every next run.
 * @param id
 * @param strategy - Cache strategy
 * @param valid
 */
export function handleCacheStrategy<T, TData>(
  id: string,
  strategy?: CacheStrategy<TData, T>,
  valid: boolean = true,
): OperatorFunction<BuilderState<T>, BuilderState<T>> {
  return (source) => {
    if (!strategy || !isCacheEnabled) return source;

    const cache = createCache(undefined, strategy.files?.(), strategy.getData?.() ?? {});

    const sourceWithCache = source.pipe(
      tap((state) => {
        if (isBuilderDone(state)) {
          PENDING_CACHE.push(() =>
            updateCache(
              strategy.id,
              createCache(
                undefined,
                strategy.files?.(),
                strategy.getData?.() ?? {},
                strategy.action === 'restore' ? strategy.toCache(state.result) : undefined,
              ),
            ),
          );
        }
      }),
    );

    // If the builder is already restored, return the source with cache.
    // Since this function is called every time the builder is triggered (because of `switchMap` in
    // `runBuild` function), we need to make sure that the builder is restored only once
    if (restoredBuilders.has(id)) {
      return sourceWithCache;
    }

    const isCacheVal = isCacheValid(strategy.id, cache);
    const isValid = cache && valid && isColdStart() && isCacheVal;
    const savedCache = loadCache<TData>(strategy.id);

    savedCache.data && strategy.onCacheLoad?.(savedCache.data as TData);
    restoredBuilders.add(id);

    switch (strategy.action) {
      case 'skip':
        return isValid ? EMPTY : sourceWithCache;
      case 'restore':
        return isValid
          ? of(new BuilderDone(strategy.id, strategy.fromCache(savedCache.result ?? '') as T, true))
          : sourceWithCache;
      default:
        return source;
    }
  };
}
