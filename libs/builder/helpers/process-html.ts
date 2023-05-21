import {NgDocEntity} from '../engine/entities/abstractions/entity';
import {isRouteEntity} from './entity-type';
import {importEsModule} from './import-es-module';

type Utils = typeof import('@ng-doc/utils');

/**
 * Processes html content for the current entity
 *
 * @param entity - The current entity
 * @param html - The html content to process
 */
export async function processHtml(entity: NgDocEntity, html: string): Promise<string> {
	const utils: Utils = await importEsModule<Utils>('@ng-doc/utils');

	return utils.htmlPostProcessor(html, {
		headings: entity.context.config.guide?.anchorHeadings,
		route: isRouteEntity(entity) ? entity.fullRoute : undefined,
		addUsedKeyword: entity.usedKeywords.add.bind(entity.usedKeywords),
		getKeyword: entity.builder.entities.getByKeyword.bind(entity.builder.entities),
	});
}
