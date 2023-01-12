import {NgDocKindType} from '@ng-doc/core';

import {NgDocRouteEntity} from '../engine/entities/abstractions/route.entity';
import {NgDocKeywordType} from '../types';
import {isApiPageEntity, isPageEntity} from './entity-type';
import {getKindType} from './get-kind-type';

/**
 *
 * @param entity
 */
export function getKeywordTypeFromEntity(entity: NgDocRouteEntity): NgDocKeywordType | undefined {
	if (isApiPageEntity(entity)) {
		const kindType: NgDocKindType | undefined = entity.declaration && getKindType(entity.declaration);

		return kindType ?? 'api';
	}

	if (isPageEntity(entity)) {
		return 'guideline';
	}

	return undefined;
}
