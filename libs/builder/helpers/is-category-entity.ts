import {NgDocCategoryPoint} from '../engine/entities/category';
import {Constructable} from '../types';

/**
 *
 * @param page
 */
export function isCategoryEntity(page: InstanceType<Constructable>): page is NgDocCategoryPoint {
	return page instanceof NgDocCategoryPoint;
}
