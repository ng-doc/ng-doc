import * as crypto from 'crypto';
import * as fs from 'fs';

/**
 * Creates cache for given file
 *
 * @param filePath - path to file, for which cache should be created
 */
export function createCacheForFile(filePath: string): string {
	try {
		return crypto.createHash('md5').update(fs.readFileSync(filePath, 'utf-8')).digest('hex');
	} catch (e) {
		return '';
	}
}
