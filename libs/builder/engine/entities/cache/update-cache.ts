import * as fs from "fs";

import {NgDocCachedEntity} from '../abstractions/cached.entity';
import {createCache} from "./create-cache";
import {getCacheFilePath} from './get-cache-file-path';
import {NgDocCache} from './interfaces';

/**
 * Updates cache for given files
 * This function creates object and writes it to cache file
 *
 * @param id - unique id for cache
 * @param entity
 */
export function updateCache(id: string, entity: NgDocCachedEntity): void {
	const cacheFilePath: string = getCacheFilePath(id);
	const cache: NgDocCache = createCache(entity);

	fs.writeFileSync(cacheFilePath, JSON.stringify(cache, null, 2));
}
