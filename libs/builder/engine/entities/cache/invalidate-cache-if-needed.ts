import * as fs from 'fs';

import {createCache} from './create-cache';
import {getCacheDirPath} from './get-cache-dir-path';
import {NgDocCache} from './interfaces';
import {isCacheValid} from './is-cache-valid';
import {updateCache} from './update-cache';

const CORE_CACHE_ID: string = 'ng-doc-core';

/**
 * Checks the version of the current package and invalidates the cache if necessary
 *
 * @param coreFiles - list of core files, if they were changed, the cache will be invalidated
 */
export function invalidateCacheIfNeeded(coreFiles: string[] = []): void {
	const cacheDirPath: string = getCacheDirPath();
	const version: string = require('../../../package.json').version;
	const cache: NgDocCache = createCache(version, coreFiles);

	if (!isCacheValid(CORE_CACHE_ID, cache)) {
		fs.rmSync(cacheDirPath, {recursive: true, force: true});
	}

	fs.mkdirSync(cacheDirPath, {recursive: true});
	updateCache(CORE_CACHE_ID, cache);
}
