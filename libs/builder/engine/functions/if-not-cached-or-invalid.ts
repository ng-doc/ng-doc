import {asArray} from '@ng-doc/core';

import {NgDocEntity} from '../entities/abstractions/entity';
import {NgDocCache} from '../entities/cache';
import {NgDocEntityStore} from '../entity-store';

/**
 *
 * @param cache
 * @param store
 */
export function ifNotCachedOrInvalid(cache: NgDocCache, store: NgDocEntityStore): (entity: NgDocEntity) => boolean {
	return (entity: NgDocEntity) => {
		const cacheIsInvalid: boolean = !cache.isCacheValid(entity);

		const keywordIsMissing: boolean = asArray(entity.usedKeywords)
			.some((keyword: string) => !store.getByKeyword(keyword));

		const keywordAppears: boolean = asArray(entity.potentialKeywords)
			.some((keyword: string) => !!store.getByKeyword(keyword));

		return cacheIsInvalid || keywordIsMissing || keywordAppears;
	}
}
