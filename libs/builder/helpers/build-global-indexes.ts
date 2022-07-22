import {AbstractConstructor, Constructor} from '@ng-doc/core';
import * as lunr from 'lunr';
import {marked} from 'marked';
import * as minimatch from 'minimatch';

import {NgDocApiPageEntity} from '../engine';
import {NgDocEntity} from '../engine/entities/abstractions/entity';
import {NgDocNavigationEntity} from '../engine/entities/abstractions/navigation.entity';
import {NgDocRouteEntity} from '../engine/entities/abstractions/route.entity';
import {NgDocEntityStore} from '../engine/entity-store';
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
 * @param entityStore
 */
export function buildGlobalIndexes(entityStore: NgDocEntityStore): string {
	return buildIndexes(entityStore, NgDocNavigationEntity);
}

/**
 *
 * @param entityStore
 * @param entityType
 */
function buildIndexes<T extends NgDocRouteEntity<unknown>>(
	entityStore: NgDocEntityStore,
	entityType: Constructor<T> | AbstractConstructor<T>,
): string {
	const indexes: NgDocPageIndex[] = [];

	(entityStore.asArray().filter((entity: NgDocEntity) => entity instanceof entityType) as T[]).forEach(
		(entity: T) => {
			const pageIndexes: NgDocPageIndex[] = entity.artifacts
				.filter((artifact: NgDocBuiltOutput) => minimatch(artifact.filePath, '**/*.md'))
				.map((artifact: NgDocBuiltOutput) => {
					const tokens: marked.TokensList = marked.lexer(artifact.output);

					return extractIndexes(entity.route, entity.title, tokens);
				})
				.flat();

			indexes.push(...pageIndexes);
		},
	);

	const index: lunr.Index = lunr((builder: lunr.Builder) => {
		builder.ref('route');
		builder.field('heading', {boost: 10});
		builder.field('content', {boost: 5});

		indexes.forEach((index: NgDocPageIndex) => builder.add(index));
	});

	return JSON.stringify(index);
}

/**
 *
 * @param route
 * @param title
 * @param tokens
 * @param indexes
 */
function extractIndexes(route: string, title: string, tokens: marked.Token[]): NgDocPageIndex[] {
	return tokens
		.filter(isAcceptableToken)
		.reduce((indexes: NgDocPageIndex[], token: NgDocTokenTypes, index: number) => {
			if (index === 0 && token.type !== 'heading') {
				indexes.push({route, heading: title, content: ''});
			} else if (token.type === 'heading') {
				indexes.push({route, heading: extractText(token), content: ''});
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
