import minimatch from 'minimatch';
import {Constructor} from 'ts-morph';

import {
	API_PATTERN,
	CATEGORY_PATTERN,
	NgDocApiEntity,
	NgDocCategoryEntity,
	NgDocPageEntity,
	PAGE_PATTERN,
} from '../engine';
import {NgDocEntity} from '../engine/entities/abstractions/entity';

/**
 *
 * @param path
 */
export function getEntityConstructor(path: string): Constructor<NgDocEntity> {
	if (minimatch(path, PAGE_PATTERN)) {
		return NgDocPageEntity;
	} else if (minimatch(path, CATEGORY_PATTERN)) {
		return NgDocCategoryEntity;
	} else if (minimatch(path, API_PATTERN)) {
		return NgDocApiEntity;
	} else {
		throw new Error(`Unknown entity type for path: ${path}`);
	}
}
