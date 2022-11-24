import {NgDocRouteEntity} from '../../entities/abstractions/route.entity';
import {NgDocEntityStore} from '../../entity-store';

const visit: any = require('unist-util-visit-parents');
const is: any = require('hast-util-is-element');
const textContent: any = require('hast-util-to-string');

/**
 *
 * @param entityStore
 */
export default function autolinkCode(entityStore: NgDocEntityStore): any {
	return (tree: any) =>visit(tree, 'element', (node: any, _: any, parent: any) => {
		if (!isCodeNode(node)) {
			return;
		}

		const isInlineCode: boolean = !is(parent, 'pre');

		visit(node, 'text', (node: any, ancestors: any) => {
			if (hasLinkAncestor(ancestors)) {
				return;
			}

			const parent: any = ancestors[ancestors.length - 1];
			const index: number = parent.children.indexOf(node);

			// Parse the text for words that we can convert to links
			const nodes: any[] = getNodes(node, entityStore, isInlineCode);
			// Replace the text node with the links and leftover text nodes
			// @ts-ignore
			Array.prototype.splice.apply(parent.children, [index, 1].concat(nodes));
			// Do not visit this node's children or the newly added nodes
			return [visit.SKIP, index + nodes.length];
		})
	})
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
 * @param entityStore
 * @param inlineLink
 */
function getNodes(node: any, entityStore: NgDocEntityStore, inlineLink: boolean) {
	return textContent(node)
		.split(/([A-Za-z0-9_.-]+)/)
		.filter((word: string) => word.length)
		.map((word: string) => {
			const entity: NgDocRouteEntity | undefined = entityStore.getByKeyword(word);

			return entity
				? createLinkNode(
					inlineLink
						? entity.title
						: word, entity.fullRoute
				)
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
		children: [{type: 'text', value: text}]
	};
}
