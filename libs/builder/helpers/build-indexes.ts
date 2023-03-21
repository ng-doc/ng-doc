import {create, ResolveSchema} from '@lyrasearch/lyra';
import {defaultHtmlSchema, NodeContent, populate} from '@lyrasearch/plugin-parsedoc';
import {NgDocPageSectionIndex} from '@ng-doc/core/interfaces';
import * as path from 'path';

import {NgDocEntity} from '../engine/entities/abstractions/entity';
import {NgDocRouteEntity} from '../engine/entities/abstractions/route.entity';
import {NgDocBuiltOutput} from '../interfaces';
import {isApiPageEntity, isRouteEntity} from './entity-type';

/**
 *
 * @param entities
 */
export async function buildIndexes(entities: NgDocEntity[]): Promise<NgDocPageSectionIndex[]> {
	const pages: NgDocPageSectionIndex[] = [];

	for (const entity of entities) {
		if (entity instanceof NgDocRouteEntity) {
			const artifacts: NgDocBuiltOutput[] = entity.artifacts.filter(
				(artifact: NgDocBuiltOutput) => path.extname(artifact.filePath) === '.html',
			);

			for (const artifact of artifacts) {
				const db = await create({
					schema: {
						...defaultHtmlSchema,
					},
				});

				const indexableContent: string = removeNotIndexableTags(artifact.content);

				await populate(db, indexableContent, 'html', {
					transformFn: (node: NodeContent) => transformFn(node),
				});

				let section: ResolveSchema<typeof defaultHtmlSchema> | undefined;

				Object.values(db.docs)
					.filter(isIndexable)
					.forEach((doc?: ResolveSchema<typeof defaultHtmlSchema>) => {
						if (doc) {
							if (isHeading(doc)) {
								section = doc;
							} else {
								pages.push({
									breadcrumbs: buildBreadcrumbs(entity),
									pageType: isApiPageEntity(entity) ? 'api' : 'guide',
									title: entity.title,
									sectionTitle: section?.content ?? '',
									route: entity.fullRoute,
									// eslint-disable-next-line @typescript-eslint/ban-ts-comment
									// @ts-ignore
									fragment: section?.properties && section.properties['id'],
									content: doc.content,
								});
							}
						}
					});
			}
		}
	}

	return pages;
}

/**
 *
 * @param entity
 */
function buildBreadcrumbs(entity: NgDocRouteEntity): string {
	return isRouteEntity(entity.parent) ? `${buildBreadcrumbs(entity.parent)} • ${entity.title}` : entity.title;
}

/**
 *
 * @param doc
 */
function isIndexable(doc?: ResolveSchema<typeof defaultHtmlSchema>): boolean {
	return !!doc?.content.trim();
}

/**
 *
 * @param node
 * @param doc
 */
function isHeading(doc: ResolveSchema<typeof defaultHtmlSchema>): boolean {
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
function removeNotIndexableTags(html: string): string {
	return require('rehype')().use(removeCodeBlocks).processSync(html).toString();
}

/**
 *
 */
function removeCodeBlocks(): any {
	const filter = require('unist-util-filter');

	return (tree: any) => {
		return filter(tree, {cascade: false}, (node: any) => {
			const preWithCode: boolean =
				node?.tagName === 'pre' && node?.children?.some((child: any) => child?.tagName === 'code');
			const notIndexable: boolean = node?.properties?.indexable === 'false';

			return !node?.tagName || (!preWithCode && !notIndexable);
		});
	};
}
