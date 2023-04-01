import {NgDocPageIndex} from '@ng-doc/core/interfaces';
import {create} from '@orama/orama';
import {defaultHtmlSchema, NodeContent, populate} from '@orama/plugin-parsedoc';
import * as path from 'path';
import {from} from 'rxjs';
import {switchMap} from 'rxjs/operators';

import {NgDocEntity} from '../engine/entities/abstractions/entity';
import {NgDocRouteEntity} from '../engine/entities/abstractions/route.entity';
import {NgDocBuiltOutput} from '../interfaces';
import {isApiPageEntity, isRouteEntity} from './entity-type';
import {importEsModule} from './import-es-module';

/**
 *
 * @param entity
 * @param artifacts
 */
export async function buildIndexes(entity: NgDocEntity, artifacts: NgDocBuiltOutput[]): Promise<NgDocPageIndex[]> {
	const pages: NgDocPageIndex[] = [];

	if (entity instanceof NgDocRouteEntity) {
		const htmlArifacts: NgDocBuiltOutput[] = artifacts.filter(
			(artifact: NgDocBuiltOutput) => path.extname(artifact.filePath) === '.html',
		);

		for (const artifact of htmlArifacts) {
			const db = await create({
				schema: {
					...defaultHtmlSchema,
				},
			});

			const indexableContent: string = await removeNotIndexableContent(artifact.content);

			await populate(db, indexableContent, 'html', {
				transformFn: (node: NodeContent) => transformFn(node),
			});

			let section: typeof defaultHtmlSchema | undefined;

			// eslint-disable-next-line @typescript-eslint/ban-ts-comment
			// @ts-ignore
			Object.values(db.data.docs.docs as unknown as Array<typeof defaultHtmlSchema>)
				.filter(isIndexable)
				.forEach((doc?: typeof defaultHtmlSchema) => {
					if (doc) {
						if (isHeading(doc)) {
							section = doc;
						} else {
							pages.push({
								breadcrumbs: buildBreadcrumbs(entity),
								pageType: isApiPageEntity(entity) ? 'api' : 'guide',
								title: entity.title,
								section: section?.content ?? '',
								route: entity.fullRoute,
								// eslint-disable-next-line @typescript-eslint/ban-ts-comment
								// @ts-ignore
								fragment: section?.properties && section.properties['id'],
								content: doc.content.toString() === '%%API_NAME_ANCHOR%%' ? undefined : doc.content.toString(),
							});
						}
					}
				});
		}
	}

	return pages;
}

/**
 *
 * @param entity
 */
function buildBreadcrumbs(entity: NgDocRouteEntity): string[] {
	return isRouteEntity(entity.parent) ? [...buildBreadcrumbs(entity.parent), entity.title] : [entity.title];
}

/**
 *
 * @param doc
 */
function isIndexable(doc?: typeof defaultHtmlSchema): boolean {
	return !!doc?.content?.trim();
}

/**
 *
 * @param node
 * @param doc
 */
function isHeading(doc: typeof defaultHtmlSchema): boolean {
	// eslint-disable-next-line @typescript-eslint/ban-ts-comment
	// @ts-ignore
	return ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(doc.type) && !!doc?.properties && !!doc.properties['id'];
}

/**
 *
 * @param node
 * @param entity
 */
function transformFn(node: NodeContent): NodeContent {
	switch (node.tag) {
		case 'strong':
		case 'a':
		case 'time':
		case 'span':
		case 'small':
		case 'b':
		case 'p':
		case 'ul':
			return {...node, raw: `<p>${node.content}</p>`};
		default:
			return node;
	}
}

/**
 *
 * @param html
 */
async function removeNotIndexableContent(html: string): Promise<string> {
	return from(importEsModule<typeof import('@ng-doc/utils')>('@ng-doc/utils'))
		.pipe(switchMap((utils: typeof import('@ng-doc/utils')) => utils.removeNotIndexableContent(html)))
		.toPromise();
}
