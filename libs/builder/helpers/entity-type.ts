import {NgDocCategoryEntity, NgDocDependenciesEntity, NgDocPageEntity, NgDocPlaygroundEntity} from '../engine';
import {Constructable} from '../types';

/**
 *
 * @param page
 */
export function isPageEntity(page: InstanceType<Constructable>): page is NgDocPageEntity {
	return page instanceof NgDocPageEntity;
}

/**
 *
 * @param dependency
 */
export function isDependencyEntity(
	dependency: InstanceType<Constructable>,
): dependency is NgDocDependenciesEntity {
	return dependency instanceof NgDocDependenciesEntity;
}

/**
 *
 * @param page
 */
export function isCategoryEntity(page: InstanceType<Constructable>): page is NgDocCategoryEntity {
	return page instanceof NgDocCategoryEntity;
}

/**
 *
 * @param page
 */
export function isPlaygroundEntity(page: InstanceType<Constructable>): page is NgDocPlaygroundEntity {
	return page instanceof NgDocPlaygroundEntity;
}
