import {NgDocCachedEntity} from '../abstractions/cached.entity';
import {createCache} from './create-cache';
import {NgDocCache} from './interfaces';
import {loadCache} from './load-cache';

/**
 * Checks if cache is valid for given files
 *
 * @param id - unique id for cache
 * @param entity
 */
export function isCacheValid(id: string, entity: NgDocCachedEntity): boolean {
	const cache: NgDocCache = loadCache(id);
	const currentCacheEntity: NgDocCache = createCache(entity);

	return Object.keys(currentCacheEntity.files ?? {}).every(
		(filePath: string) => cache.files?.[filePath] === currentCacheEntity.files?.[filePath],
	);
}
