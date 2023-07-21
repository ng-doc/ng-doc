import {NgDocPageIndex} from '@ng-doc/core';

import {getPageType} from '../../../../helpers';
import {buildIndexes} from '../../../../helpers/build-indexes';
import {NgDocRouteEntity} from '../../abstractions/route.entity';
import {NgDocEntityPlugin} from '../types';

/**
 *
 */
export function fillIndexesPlugin(): NgDocEntityPlugin<string, NgDocRouteEntity> {
	return {
		id: 'fillIndexesPlugin',
		implementation: async (data, entity) => {
			const indexes: NgDocPageIndex[] = await buildIndexes({
				title: entity.title,
				content: data,
				pageType: getPageType(entity),
				breadcrumbs: entity.breadcrumbs,
				route: entity.fullRoute,
			});

			entity.indexes.push(...indexes);

			return data;
		},
	};
}
