import {create, ResolveSchema} from '@lyrasearch/lyra';
import {defaultHtmlSchema, NodeContent, populate} from '@lyrasearch/plugin-parsedoc';
import {NgDocPageSectionIndex} from '@ng-doc/core/interfaces';
import * as path from 'path';
import {filter} from 'unist-util-filter'

import {NgDocEntity} from '../engine/entities/abstractions/entity';
import {NgDocRouteEntity} from '../engine/entities/abstractions/route.entity';
import {NgDocBuiltOutput} from '../interfaces';
import {isApiPageEntity} from './entity-type';

const NOT_INDEXABLE_TAGS: string[] = ['code'];

/**
 *
 * @param entities
 */
export async function buildIndexes(entities: NgDocEntity[]): Promise<NgDocPageSectionIndex[]> {
	const pages: NgDocPageSectionIndex[] = [];

	for (const entity of entities) {
		if (entity instanceof NgDocRouteEntity) {
			const artifacts: NgDocBuiltOutput[] = entity.artifacts.filter((artifact: NgDocBuiltOutput) => path.extname(artifact.filePath) === '.html');

			for (const artifact of artifacts) {
				const db = await create({ schema: {
						...defaultHtmlSchema,
					} });

				await populate(db, removeNotIndexableTags(artifact.content), 'html', {
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
									pageType: isApiPageEntity(entity) ? 'api' : 'guide',
									title: entity.title,
									sectionTitle: section?.content ?? '',
									route: sectionRoute(entity.fullRoute, doc),
									content: doc.content,
								})
							}
						}
					})

			}
		}
	}


	return pages;
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
	// @ts-ignore
	return ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(doc.type) && !!doc?.properties && !!doc.properties['id'];
}

/**
 *
 * @param route
 * @param doc
 */
function sectionRoute(route: string, doc: ResolveSchema<typeof defaultHtmlSchema>): string {
	// @ts-ignore
	const anchor = doc?.properties && doc.properties['id'] ? `#${doc.properties['id']}` : '';

	return `${route}${anchor}`;
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
			return { ...node, raw: `<p>${node.content}</p>`}
		default:
			return node
	}
}


/**
 *
 * @param html
 */
function removeNotIndexableTags(html: string): string {
	return require('rehype')()
		.use(removeCodeBlocks())
		.processSync()
		.toString();
}

/**
 *
 */
function removeCodeBlocks(): any {
	return (tree: any) => {
		filter(tree, {cascade: false}, (node: any) => !NOT_INDEXABLE_TAGS.includes(node.tag));
	};
}
