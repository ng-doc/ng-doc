import crypto from 'crypto';
import findCacheDir from 'find-cache-dir';
import fs from 'fs';
import path from 'path';

import {NgDocCache} from '../interfaces';

/**
 * Creates cache for given files, returns object with file path as key and md5 hash as value
 * This function doesn't create cache file, it just creates cache object
 *
 * @param filePaths - list of files to create cache for
 */
export function createCache(filePaths: string[]): NgDocCache {
	return filePaths.reduce((acc: NgDocCache, filePath: string) => {
		try {
			acc[filePath] = crypto.createHash('md5').update(fs.readFileSync(filePath, 'utf-8')).digest('hex');
		} catch (e) {
			// ignore
		}
		return acc;
	}, {});
}

/**
 * Updates cache for given files
 * This function creates object and writes it to cache file
 *
 * @param id - unique id for cache
 * @param filePaths - list of files to create cache for
 */
export function updateCache(id: string, filePaths: string[]): void {
	const cacheFilePath: string = getCacheFilePath(id);
	const cache: NgDocCache = createCache(filePaths);

	fs.writeFileSync(cacheFilePath, JSON.stringify(cache, null, 2));
}

/**
 * Checks if cache is valid for given files
 *
 * @param id - unique id for cache
 * @param filePaths - list of files to create cache for
 */
export function isCacheValid(id: string, filePaths: string[]): boolean {
	const cache: NgDocCache = loadCache(id);
	const currentCacheEntity: NgDocCache = createCache(filePaths);

	return Object.keys(currentCacheEntity).every((filePath: string) => cache[filePath] === currentCacheEntity[filePath]);
}

/**
 * Loads cache for given id
 *
 * @param id
 */
export function loadCache(id: string): NgDocCache {
	try {
		const cacheFilePath: string = getCacheFilePath(id);
		const cacheContent: string = fs.readFileSync(cacheFilePath, 'utf-8');

		return  JSON.parse(cacheContent);
	} catch (e) {
		return {};
	}
}

/**
 * Returns cache file path for given id
 *
 * @param id - unique id for cache
 */
export function getCacheFilePath(id: string): string {
	return `${path.join(
		getCacheDirPath(),
		crypto.createHash('md5').update(id).digest('hex'),
	)}.json`;
}

/**
 * Returns cache directory path
 */
export function getCacheDirPath(): string {
	return path.join(
		findCacheDir({
			name: 'ng-doc',
			create: true,
		}) ?? '',
	);
}

/**
 * Checks the version of the current package and invalidates the cache if necessary
 */
export function invalidateCacheIfNecessary(): void {
	const cacheDirPath: string = getCacheDirPath();
	const cacheVersionFilePath: string = path.join(cacheDirPath, 'version.cache');
	const currentVersion: string = require('../package.json').version;
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
