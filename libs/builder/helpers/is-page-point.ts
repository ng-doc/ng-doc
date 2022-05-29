import {NgDocPagePoint} from '../engine';
import {Constructable} from '../types';

/**
 *
 * @param page
 */
export function isPagePoint(page: InstanceType<Constructable>): page is NgDocPagePoint {
	return page instanceof NgDocPagePoint;
}
