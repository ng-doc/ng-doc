import {
	AbstractConstructor,
	asArray,
	Constructor,
	humanizeDeclarationName,
	isNodeTag,
	NgDocPageInfos,
	NgDocPageType
} from '@ng-doc/core';
import lunr from 'lunr';
import minimatch from 'minimatch';
import {Node, NodeTag, parser} from 'posthtml-parser'

import {NgDocApiPageEntity} from '../engine/entities';
import {NgDocEntity} from '../engine/entities/abstractions/entity';
import {NgDocRouteEntity} from '../engine/entities/abstractions/route.entity';
import {NgDocBuiltOutput, NgDocPageIndex} from '../interfaces';

/**
 *
 * @param entities
 */
export function buildGlobalIndexes(entities: NgDocEntity[]): string[] {
	return buildIndexes(entities, NgDocRouteEntity);
}

/**
 *
 * @param entities
 * @param entityType
 */
function buildIndexes<T extends NgDocRouteEntity<unknown>>(
	entities: NgDocEntity[],
	entityType: Constructor<T> | AbstractConstructor<T>,
): string[] {
	const indexes: NgDocPageIndex[] = [];

	(entities.filter((entity: NgDocEntity) => entity instanceof entityType) as T[]).forEach(
		(entity: T) => {
			const pageIndexes: NgDocPageIndex[] = entity.artifacts
				.filter((artifact: NgDocBuiltOutput) => minimatch(artifact.filePath, '**/*.html'))
				.map((artifact: NgDocBuiltOutput) => {
					const nodes: Node[] = parser(artifact.content);

					return extractIndexes(entity, nodes);
				})
				.flat();

			indexes.push(...pageIndexes);
		},
	);

	const queryLexer: {termSeparator: RegExp} = (lunr as unknown as {QueryLexer: {termSeparator: RegExp}}).QueryLexer;
	queryLexer.termSeparator = lunr.tokenizer.separator = /\s+/;

	const index: lunr.Index = lunr((builder: lunr.Builder) => {
		builder.pipeline.remove(lunr.stemmer);

		builder.ref('route');
		builder.field('heading', {boost: 10});
		builder.field('content', {boost: 5});

		indexes.forEach((index: NgDocPageIndex) => builder.add(index));
	});

	const pages: NgDocPageInfos = indexes.reduce((pages: NgDocPageInfos, index: NgDocPageIndex) => {
		pages[index.route] = {
			route: index.route,
			title: index.title,
			type: index.type,
			kind: index.kind,
		};

		return pages;
	}, {});

	return [JSON.stringify(pages), JSON.stringify(index)];
}

/**
 *
 * @param entity
 * @param nodes
 * @param parentIndex
 * @param indexes
 */
function extractIndexes<T extends NgDocRouteEntity<unknown>>(entity: T, nodes: Node[], indexes: NgDocPageIndex[] = []): NgDocPageIndex[] {
	if (!indexes.length) {
		indexes.push({
			route: entity.fullRoute,
			type: getTypeFromEntity(entity),
			title: entity.title,
			heading: entity.title,
			content: '',
			kind: getKindFromEntity(entity),
		})
	}

	nodes.forEach((node: Node) => {
			if (isNodeTag(node)) {
				if (!isIgnoredTag(node)) {
					if (isHeadingTag(node)) {
						indexes.push({
							route: entity.fullRoute,
							type: getTypeFromEntity(entity),
							title: entity.title,
							heading: extractText(node),
							content: '',
							kind: getKindFromEntity(entity),
						});
					} else if (Array.isArray(node.content)) {
						indexes[indexes.length - 1].content += extractText(node);

						extractIndexes(entity, asArray(node.content).flat(), indexes);
					}
				}
			}
		})
	return indexes;
}

/**
 *
 * @param node
 */
function isIgnoredTag(node: NodeTag): boolean {
	return ['pre', 'code', 'div', 'span'].includes(String(node.tag));
}

/**
 *
 * @param node
 */
function extractText(node: Node): string {
	if (isNodeTag(node)) {
		return isIgnoredTag(node)
				? ''
				: (asArray(node.content).flat().filter((node: Node) => typeof node === 'string') as string[])
				.map((str: string) => str.trim())
				.join('\n')
	} else {
		return String(node);
	}
}

/**
 *
 * @param entity
 */
function getTypeFromEntity(entity: NgDocEntity): NgDocPageType {
	if (entity instanceof NgDocApiPageEntity) {
		return 'api';
	}
	return 'guide';
}

/**
 *
 * @param node
 */
function isHeadingTag(node: NodeTag): boolean {
	return ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(String(node.tag));
}

/**
 *
 * @param node
 */
function isHeaderTag(node: NodeTag): boolean {
	return ['header'].includes(String(node.tag));
}

/**
 *
 * @param node
 */
function isSectionTag(node: NodeTag): boolean {
	return ['section'].includes(String(node.tag));
}

/**
 *
 * @param node
 */
function isParagraph(node: NodeTag): boolean {
	return ['p'].includes(String(node.tag));
}

/**
 *
 * @param entity
 */
function getKindFromEntity(entity: NgDocEntity): string | undefined {
	if (entity instanceof NgDocApiPageEntity) {
		return humanizeDeclarationName(entity.declaration?.getKindName() ?? '');
	}
	return undefined;
}
