import { EMPTY_FUNCTION, NgDocEntityAnchor } from '@ng-doc/core';

import { NgDocEntity } from '../engine/entities/abstractions/entity';
import { isRouteEntity } from './entity-type';
import { importEsm } from './import-esm';

type Utils = typeof import('@ng-doc/utils');

/**
 * Processes html content for the current entity
 *
 * @param entity - The current entity
 * @param html - The html content to process
 */
export async function processHtml(html: string, entity: NgDocEntity): Promise<string> {
	const utils: Utils = await importEsm<Utils>('@ng-doc/utils');

	return utils.htmlProcessor(html, {
		headings: entity?.context.config.guide?.anchorHeadings,
		route: isRouteEntity(entity) ? entity.fullRoute : undefined,
		raiseError: entity?.warnings.push.bind(entity.warnings) ?? EMPTY_FUNCTION,
		addAnchor: (anchor: NgDocEntityAnchor) =>
			isRouteEntity(entity) ? entity.anchors.push(anchor) : undefined,
	});
}

/**
 * Post-Processes html content for the current entity
 *
 * @param entity - The current entity
 * @param html - The html content to process
 */
export async function postProcessHtml(html: string, entity?: NgDocEntity): Promise<string> {
	const utils: Utils = await importEsm<Utils>('@ng-doc/utils');

	return utils.htmlPostProcessor(html, {
		raiseError: entity?.warnings.push.bind(entity.warnings) ?? EMPTY_FUNCTION,
		addUsedKeyword: entity?.usedKeywords.add.bind(entity.usedKeywords),
		addPotentialKeyword: entity?.potentialKeywords.add.bind(entity.potentialKeywords),
		getKeyword: entity?.store.getByKeyword.bind(entity.store),
	});
}
