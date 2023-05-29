import {NgDocPageType} from '@ng-doc/core';
import {NgDocPageIndex} from '@ng-doc/core/interfaces';
import {create} from '@orama/orama';
import {defaultHtmlSchema, NodeContent, populate} from '@orama/plugin-parsedoc';
import {firstValueFrom, from} from 'rxjs';
import {switchMap} from 'rxjs/operators';

import {importEsModule} from './import-es-module';

export interface NgDocIndexBuilderConfig {
	title: string;
	content: string;
	breadcrumbs: string[];
	pageType: NgDocPageType;
	route: string;
}

/**
 *	Builds the indexes for a given content
 *
 * @param config
 */
export async function buildIndexes(config: NgDocIndexBuilderConfig): Promise<NgDocPageIndex[]> {
	const pages: NgDocPageIndex[] = [];

	const db = await create({
		schema: {
			...defaultHtmlSchema,
		}
	});

	const indexableContent: string = await removeNotIndexableContent(config.content);

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
						breadcrumbs: config.breadcrumbs,
						pageType: config.pageType,
						title: config.title,
						section: section?.content ?? '',
						route: config.route,
						// eslint-disable-next-line @typescript-eslint/ban-ts-comment
						// @ts-ignore
						fragment: section?.properties && section.properties['id'],
						content: doc.content.toString() === '%%API_NAME_ANCHOR%%' ? undefined : doc.content.toString(),
					});
				}
			}
		});

	return pages;
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
	return firstValueFrom(from(importEsModule<typeof import('@ng-doc/utils')>('@ng-doc/utils'))
		.pipe(switchMap((utils: typeof import('@ng-doc/utils')) => utils.removeNotIndexableContent(html))));
}
