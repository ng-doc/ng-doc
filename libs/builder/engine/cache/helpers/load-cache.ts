import * as fs from 'fs';

import { NgDocCachedData } from '../interfaces';
import { getCacheFilePath } from './get-cache-file-path';

/**
 * Loads cache for given id
 * @param id
 */
export function loadCache<TData>(id: string): NgDocCachedData<TData> {
  try {
    const cacheFilePath: string = getCacheFilePath(id);
    const cacheContent: string = fs.readFileSync(cacheFilePath, 'utf-8');

    return JSON.parse(cacheContent);
  } catch (e) {
    return {};
  }
}
