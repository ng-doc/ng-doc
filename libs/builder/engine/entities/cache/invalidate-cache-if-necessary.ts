import * as fs from "fs";
import * as path from "path";

import {getCacheDirPath} from "./get-cache-dir-path";

/**
 * Checks the version of the current package and invalidates the cache if necessary
 */
export function invalidateCacheIfNecessary(): void {
	const cacheDirPath: string = getCacheDirPath();
	const cacheVersionFilePath: string = path.join(cacheDirPath, 'version.cache');
	const currentVersion: string = require('../../../package.json').version;
	let invalid: boolean = true;

	try {
		invalid = fs.readFileSync(cacheVersionFilePath, {encoding: 'utf-8'}) !== currentVersion;
	} catch (e) {
		// do nothing
	}

	if (invalid) {
		fs.rmSync(cacheDirPath, {recursive: true, force: true});
	}

	fs.mkdirSync(cacheDirPath, {recursive: true});
	fs.writeFileSync(cacheVersionFilePath, currentVersion);
}
