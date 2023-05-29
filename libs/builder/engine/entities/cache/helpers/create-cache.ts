import {NgDocCachedData} from '../interfaces';
import {createCacheForFile} from './create-cache-for-file';

/**
 * Creates cache for given files, returns object with file path as key and md5 hash as value
 *
 * @param version - version of the current package
 * @param files - list of files, for which cache should be created
 * @param properties - properties, which should be cached
 */
export function createCache(version?: string, files?: string[], properties?: Record<string, unknown>): NgDocCachedData {
	const cache: NgDocCachedData = {version, properties};

	files?.forEach((filePath: string) => {
		if (!cache.files) {
			cache.files = {};
		}

		cache.files[filePath] = createCacheForFile(filePath);
	});

	return cache;
}
