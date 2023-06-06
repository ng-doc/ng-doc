import {NgDocApiEntity, NgDocApiPageEntity, NgDocApiScopeEntity, NgDocCategoryEntity, NgDocPageEntity} from '../engine';
import {NgDocFileEntity} from '../engine/entities/abstractions/file.entity';
import {NgDocNavigationEntity} from '../engine/entities/abstractions/navigation.entity';
import {NgDocRouteEntity} from '../engine/entities/abstractions/route.entity';
import {NgDocSourceFileEntity} from '../engine/entities/abstractions/source-file.entity';
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
 * @param page
 */
export function isCategoryEntity(page: InstanceType<Constructable>): page is NgDocCategoryEntity {
	return page instanceof NgDocCategoryEntity;
}

/**
 *
 * @param page
 */
export function isSourceFileEntity(page: InstanceType<Constructable>): page is NgDocSourceFileEntity {
	return page instanceof NgDocSourceFileEntity;
}

/**
 *
 * @param page
 */
export function isNavigationEntity(page: InstanceType<Constructable>): page is NgDocNavigationEntity<unknown> {
	return page instanceof NgDocNavigationEntity;
}

/**
 *
 * @param page
 */
export function isApiEntity(page: InstanceType<Constructable>): page is NgDocApiEntity {
	return page instanceof NgDocApiEntity;
}

/**
 *
 * @param page
 */
export function isFileEntity<T>(page: InstanceType<Constructable>): page is NgDocFileEntity<T> {
	return page instanceof NgDocFileEntity;
}

/**
 *
 * @param page
 */
export function isApiPageEntity(page: InstanceType<Constructable>): page is NgDocApiPageEntity {
	return page instanceof NgDocApiPageEntity;
}

/**
 *
 * @param page
 */
export function isApiScopeEntity(page: InstanceType<Constructable>): page is NgDocApiScopeEntity {
	return page instanceof NgDocApiScopeEntity;
}

/**
 *
 * @param page
 */
export function isRouteEntity(page: InstanceType<Constructable>): page is NgDocRouteEntity<unknown> {
	return page instanceof NgDocRouteEntity;
}
