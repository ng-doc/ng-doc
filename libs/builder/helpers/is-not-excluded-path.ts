import {asArray} from '@ng-doc/core';
import {minimatch} from 'minimatch';

import {miniPattern} from './mini-pattern';

/**
 *
 * @param path
 * @param excluded
 */
export function isNotExcludedPath(path: string, excluded: string[]): boolean {
	return asArray(excluded).every((e: string) => !minimatch(path, miniPattern(e)));
}
