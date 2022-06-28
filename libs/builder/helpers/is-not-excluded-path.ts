import * as minimatch from 'minimatch';

import {asArray} from './as-array';

/**
 *
 * @param path
 * @param excluded
 */
export function isNotExcludedPath(path: string, excluded: string[]): boolean {
	return asArray(excluded).every((e: string) => !minimatch(path, e));
}
