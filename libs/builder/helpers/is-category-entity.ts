import {NgDocCategoryEntity} from '../engine/entities/category.entity';
import {Constructable} from '../types';

/**
 *
 * @param page
 */
export function isCategoryEntity(page: InstanceType<Constructable>): page is NgDocCategoryEntity {
	return page instanceof NgDocCategoryEntity;
}
