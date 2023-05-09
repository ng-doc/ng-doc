import {NgDocPageType} from '@ng-doc/core';

import {NgDocEntity} from '../engine/entities/abstractions/entity';
import {isApiPageEntity} from './entity-type';

/**
 *
 * @param entity
 */
export function getPageType(entity: NgDocEntity): NgDocPageType {
	return isApiPageEntity(entity) ? 'api' : 'guide';
}
