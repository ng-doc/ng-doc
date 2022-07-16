import {asArray} from '@ng-doc/core';
import * as minimatch from 'minimatch';

/**
 *
 * @param path
 * @param excluded
 */
export function isNotExcludedPath(path: string, excluded: string[]): boolean {
	return asArray(excluded).every((e: string) => !minimatch(path, e));
}
