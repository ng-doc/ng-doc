import * as crypto from 'crypto';
import * as path from 'path';

import {getCacheDirPath} from './get-cache-dir-path';

/**
 * Returns cache file path for given id
 *
 * @param id - unique id for cache
 */
export function getCacheFilePath(id: string): string {
	return `${path.join(getCacheDirPath(), crypto.createHash('md5').update(id).digest('hex'))}.json`;
}
