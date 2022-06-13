import {NgDocPageEntity} from '../engine';
import {Constructable} from '../types';

/**
 *
 * @param page
 */
export function isPageEntity(page: InstanceType<Constructable>): page is NgDocPageEntity {
	return page instanceof NgDocPageEntity;
}
