import {NgDocKeyword} from '@ng-doc/builder';

import {isPageEntity, printWarning} from '../../../helpers';
import {NgDocRouteEntity} from '../../entities/abstractions/route.entity';
import {NgDocEntityStore} from '../../entity-store';

const visit: any = require('unist-util-visit-parents');
const is: any = require('hast-util-is-element');
const textContent: any = require('hast-util-to-string');

/**
 *
 * @param entityStore
 * @param entity
 */
export default function keywordsProcessor(entityStore: NgDocEntityStore, entity?: NgDocRouteEntity): any {
	if (entity) {
		entity.usedKeywords = new Set();
	}

	return (tree: any) =>
		visit(tree, 'element', (node: any, ancestors: any) => {
			if (!isCodeNode(node)) {
				return;
			}
			const parent: any = ancestors[ancestors.length - 1];
			const isInlineCode: boolean = !is(parent, 'pre');

			visit(node, 'text', (node: any, ancestors: any) => {
				if (hasLinkAncestor(ancestors)) {
					return;
				}

				const parent: any = ancestors[ancestors.length - 1];
				const index: number = parent.children.indexOf(node);

				// Parse the text for words that we can convert to links
				const nodes: any[] = getNodes(node, parent, entityStore, isInlineCode, entity);
				// Replace the text node with the links and leftover text nodes
				// eslint-disable-next-line @typescript-eslint/ban-ts-comment
				// @ts-ignore
				Array.prototype.splice.apply(parent.children, [index, 1].concat(nodes));
				// Do not visit this node's children or the newly added nodes
				return [visit.SKIP, index + nodes.length];
			});
		});
}

/**
 *
 * @param ancestors
 */
function hasLinkAncestor(ancestors: any[]) {
	return ancestors.some((ancestor: any) => is(ancestor, 'a'));
}

/**
 *
 * @param node
 */
function isCodeNode(node: any): boolean {
	return is(node, 'code') || is(node, 'ng-doc-code');
}

/**
 *
 * @param node
 * @param parent
 * @param entityStore
 * @param inlineLink
 * @param e
 */
function getNodes(node: any, parent: any, entityStore: NgDocEntityStore, inlineLink: boolean, e?: NgDocRouteEntity) {
	const KeywordRegexp: RegExp = /([A-Za-z0-9_.-/*]+)/;

	return textContent(node)
		.split(KeywordRegexp)
		.filter((word: string) => word.length)
		.map((word: string) => {
			if (e && KeywordRegexp.test(word)) {
				e.usedKeywords.add(word);
			}

			const keyword: NgDocKeyword | undefined = entityStore.getByKeyword(word);

			if (inlineLink && /^\*\w+/gm.test(word) && !keyword) {
				printWarning(`Keyword "${word}" is missing.`);
			}

			// Convert code tag to link if it's a link to the page entity
			if (inlineLink && keyword?.isCodeLink === false) {
				parent.tagName = 'a';
				parent.properties = {href: keyword.path};

				return {type: 'text', value: keyword.title};
			} else if (inlineLink && keyword) {
				parent.properties.class = 'ng-doc-code-with-link';
			}

			// Add link inside the code if it's a link to the API entity
			return keyword
				? createLinkNode(inlineLink ? keyword.title : word, keyword.path)
				: {type: 'text', value: word};
		});
}

/**
 *
 * @param text
 * @param href
 */
function createLinkNode(text: string, href: string) {
	return {
		type: 'element',
		tagName: 'a',
		properties: {href: href, class: 'ng-doc-code-anchor'},
		children: [{type: 'text', value: text}],
	};
}
