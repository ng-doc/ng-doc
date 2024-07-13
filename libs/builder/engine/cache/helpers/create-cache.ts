import { NgDocCachedData } from '../interfaces';
import { createCacheForFile } from './create-cache-for-file';

/**
 * Creates cache for given files, returns object with file path as key and md5 hash as value
 * @param version - version of the current package
 * @param files - list of files, for which cache should be created
 * @param data - properties, which should be cached
 * @param result - result of the builder, which should be cached
 */
export function createCache(
  version?: string,
  files?: string[],
  data?: Record<string, unknown>,
  result?: string,
): NgDocCachedData {
  const cache: NgDocCachedData = { version, data, result };

  files?.forEach((filePath: string) => {
    if (!cache.files) {
      cache.files = {};
    }

    cache.files[filePath] = createCacheForFile(filePath);
  });

  return cache;
}
