import * as fs from "fs";

import {getCacheFilePath} from './get-cache-file-path';
import {NgDocCache} from './interfaces';

/**
 * Loads cache for given id
 *
 * @param id
 */
export function loadCache(id: string): NgDocCache {
	try {
		const cacheFilePath: string = getCacheFilePath(id);
		const cacheContent: string = fs.readFileSync(cacheFilePath, 'utf-8');

		return JSON.parse(cacheContent);
	} catch (e) {
		return {};
	}
}
