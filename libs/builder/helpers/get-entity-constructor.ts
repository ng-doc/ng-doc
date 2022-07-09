import * as minimatch from 'minimatch';
import {Constructor} from 'ts-morph';

import {
	API_PATTERN,
	CATEGORY_PATTERN,
	NgDocApiEntity,
	NgDocCategoryEntity,
	NgDocDependenciesEntity,
	NgDocPageEntity,
	NgDocPlaygroundEntity,
	PAGE_DEPENDENCY_PATTERN,
	PAGE_PATTERN,
	PLAYGROUND_PATTERN,
} from '../engine';
import {NgDocEntity} from '../engine/entities/abstractions/entity';
import {} from '../engine/entities/playground.entity';

/**
 *
 * @param path
 */
export function getEntityConstructor(path: string): Constructor<NgDocEntity> {
	if (minimatch(path, PAGE_PATTERN)) {
		return NgDocPageEntity;
	} else if (minimatch(path, CATEGORY_PATTERN)) {
		return NgDocCategoryEntity;
	} else if (minimatch(path, PAGE_DEPENDENCY_PATTERN)) {
		return NgDocDependenciesEntity;
	} else if (minimatch(path, API_PATTERN)) {
		return NgDocApiEntity;
	} else if (minimatch(path, PLAYGROUND_PATTERN)) {
		return NgDocPlaygroundEntity;
	} else {
		throw new Error(`Unknown entity type for path: ${path}`);
	}
}
