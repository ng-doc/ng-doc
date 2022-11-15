import {AbstractConstructor, Constructor, humanizeDeclarationName, NgDocPageInfos, NgDocPageType} from '@ng-doc/core';
import lunr from 'lunr';
import {marked} from 'marked';
import minimatch from 'minimatch';

import {NgDocApiPageEntity} from '../engine/entities';
import {NgDocEntity} from '../engine/entities/abstractions/entity';
import {NgDocRouteEntity} from '../engine/entities/abstractions/route.entity';
import {NgDocBuiltOutput, NgDocPageIndex} from '../interfaces';
import {NgDocTokenTypes} from '../types';

/**
 *
 * @param token
 */
function isAcceptableToken(token: marked.Token): token is NgDocTokenTypes {
	return ['heading', 'paragraph', 'text'].includes(token.type);
}

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
				.filter((artifact: NgDocBuiltOutput) => minimatch(artifact.filePath, '**/*.md'))
				.map((artifact: NgDocBuiltOutput) => {
					const tokens: marked.TokensList = marked.lexer(artifact.output);

					return extractIndexes(entity, tokens);
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
 * @param tokens
 */
function extractIndexes<T extends NgDocRouteEntity<unknown>>(entity: T, tokens: marked.Token[]): NgDocPageIndex[] {
	return tokens
		.filter(isAcceptableToken)
		.reduce((indexes: NgDocPageIndex[], token: NgDocTokenTypes, index: number) => {
			if (index === 0 && token.type !== 'heading') {
				indexes.push({
					route: entity.fullRoute,
					type: getTypeFromEntity(entity),
					title: entity.title,
					heading: entity.title,
					content: '',
					kind: getKindFromEntity(entity),
				});
			} else if (token.type === 'heading') {
				indexes.push({
					route: entity.fullRoute,
					type: getTypeFromEntity(entity),
					title: entity.title,
					heading: extractText(token),
					content: '',
					kind: getKindFromEntity(entity),
				});
			} else {
				indexes[indexes.length - 1].content += extractText(token);
			}

			return indexes;
		}, []);
}

/**
 *
 * @param token
 */
function extractText(token: NgDocTokenTypes): string {
	return token.tokens?.length
		? token.tokens.map((t: marked.Token) => (t.type === 'text' ? t.text : '')).join(' ')
		: token.text;
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
 * @param entity
 */
function getKindFromEntity(entity: NgDocEntity): string | undefined {
	if (entity instanceof NgDocApiPageEntity) {
		return humanizeDeclarationName(entity.declaration?.getKindName() ?? '');
	}
	return undefined;
}
