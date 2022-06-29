import * as minimatch from 'minimatch';
import {Constructor} from 'ts-morph';

import {API_PATTERN, CATEGORY_PATTERN, PAGE_DEPENDENCY_PATTERN, PAGE_PATTERN} from '../engine';
import {NgDocEntity} from '../engine/entities/abstractions/entity';
import {NgDocApiEntity} from '../engine/entities/api.entity';
import {NgDocCategoryEntity} from '../engine/entities/category.entity';
import {NgDocDependenciesEntity} from '../engine/entities/dependencies.entity';
import {NgDocPageEntity} from '../engine/entities/page.entity';

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
	} else {
		throw new Error(`Unknown entity type for path: ${path}`);
	}
}
