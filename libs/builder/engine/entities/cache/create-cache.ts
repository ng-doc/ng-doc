import * as crypto from 'crypto';
import * as fs from 'fs';

import {NgDocCachedEntity} from '../abstractions/cached.entity';
import {NgDocCache} from './interfaces';

/**
 * Creates cache for given files, returns object with file path as key and md5 hash as value
 * This function doesn't create cache file, it just creates cache object
 *
 * @param entity
 */
export function createCache(entity: NgDocCachedEntity): NgDocCache {
	const cache: NgDocCache = {properties: entity.getCachedProperties()};

	entity.cachedFilePaths.forEach((filePath: string) => {
		if (!cache.files) {
			cache.files = {};
		}

		cache.files[filePath] = crypto.createHash('md5').update(fs.readFileSync(filePath, 'utf-8')).digest('hex');
	});

	return cache;
}
