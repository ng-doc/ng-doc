/**
 * Cache strategy
 * `skip` strategy will skip the builder if cache is valid
 * `restore` strategy will restore the data from cache and return the result
 */
export type CacheStrategy<TData = unknown, TCache = unknown> = {
  /**
   * Unique id for cache
   */
  id: string;
  /**
   * Should return file paths that should be checked for changes
   */
  files?: () => string[];
  /**
   * Function to save custom data to cache
   */
  getData?: () => TData;
  /**
   * Callback that will be called when cache is loaded and valid
   */
  onCacheLoad?: (data: TData) => void;
} & (
  | {
      action: 'skip';
    }
  | {
      action: 'restore';
      toCache: (result: TCache) => string;
      fromCache: (result: string) => TCache;
    }
);
