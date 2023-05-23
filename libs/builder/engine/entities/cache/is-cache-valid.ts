import {createCacheForFile} from './create-cache-for-file';
import {NgDocCache} from './interfaces';
import {loadCache} from './load-cache';

/**
 * Checks if cache is valid for given files
 *
 * @param id - unique id for cache
 * @param cache - cache object
 */
export function isCacheValid(id: string, cache: NgDocCache): boolean {
	const savedCache: NgDocCache = loadCache(id);
	const filesAreValid: boolean = Object.keys(savedCache.files ?? {}).every(
		(filePath: string) => savedCache.files?.[filePath] === createCacheForFile(filePath),
	);
	const versionIsValid: boolean = savedCache.version === cache.version;
	const allFilesWereCached: boolean = Object.keys(cache.files ?? {}).every(
		(filePath: string) => savedCache.files?.[filePath] !== undefined,
	);

	return filesAreValid && versionIsValid && allFilesWereCached;
}
