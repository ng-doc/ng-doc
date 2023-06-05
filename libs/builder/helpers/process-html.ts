import {NgDocEntityAnchor} from '@ng-doc/core';

import {NgDocRouteEntity} from '../engine/entities/abstractions/route.entity';
import {importEsModule} from './import-es-module';

type Utils = typeof import('@ng-doc/utils');

/**
 * Processes html content for the current entity
 *
 * @param entity - The current entity
 * @param html - The html content to process
 */
export async function processHtml(entity: NgDocRouteEntity, html: string): Promise<string> {
	const utils: Utils = await importEsModule<Utils>('@ng-doc/utils');

	return utils.htmlProcessor(html, {
		headings: entity.context.config.guide?.anchorHeadings,
		route: entity.fullRoute,
		raiseError: entity.warnings.push.bind(entity.warnings),
		addAnchor: (anchor: NgDocEntityAnchor) => entity.anchors.push(anchor),
	});
}

/**
 * Post-Processes html content for the current entity
 *
 * @param entity - The current entity
 * @param html - The html content to process
 */
export async function postProcessHtml(entity: NgDocRouteEntity, html: string): Promise<string> {
	const utils: Utils = await importEsModule<Utils>('@ng-doc/utils');

	return utils.htmlPostProcessor(html, {
		raiseError: entity.warnings.push.bind(entity.warnings),
		addUsedKeyword: entity.usedKeywords.add.bind(entity.usedKeywords),
		addPotentialKeyword: entity.potentialKeywords.add.bind(entity.potentialKeywords),
		getKeyword: entity.store.getByKeyword.bind(entity.store),
	});
}
