import {NG_DOC_ELEMENT} from '@ng-doc/core/constants/defaults.js';
import {NgDocKeyword} from '@ng-doc/core/interfaces';
import {Element, Text} from 'hast';
import {isElement} from 'hast-util-is-element';
import {toString} from 'hast-util-to-string';
import {SKIP, visitParents} from 'unist-util-visit-parents';

import {hasLinkAncestor, isCodeNode} from '../helpers';
import {NgDocHtmlPostProcessorConfig} from '../html-post-processor';

const languages: string[] = ['typescript', 'ts'];

export type AddKeyword = (keyword: string) => void;
export type GetKeyword = (keyword: string) => NgDocKeyword | undefined;

/**
 *
 * @param config
 */
export default function keywordsPlugin(config: NgDocHtmlPostProcessorConfig) {
	const {addUsedKeyword, addPotentialKeyword, getKeyword} = config;

	return (tree: Element) =>
		visitParents(tree, 'element', (node: Element, ancestors: Element[]) => {
			if (!isCodeNode(node)) {
				return;
			}

			const isInlineCode: boolean = !isElement(ancestors[ancestors.length - 1], 'pre');
			const lang: string = node.properties?.['lang']?.toString() || '';

			if (isInlineCode || languages.includes(lang)) {
				visitParents(node, 'text', (node: Text, ancestors: Element[]) => {
					if (hasLinkAncestor(ancestors) || !getKeyword || !addUsedKeyword || !addPotentialKeyword) {
						return;
					}

					const parent: Element = ancestors[ancestors.length - 1];
					const index: number = parent.children.indexOf(node);

					// Parse the text for words that we can convert to links
					const nodes: any[] = getNodes(node, parent, isInlineCode, config);
					// Replace the text node with the links and leftover text nodes
					// eslint-disable-next-line @typescript-eslint/ban-ts-comment
					// @ts-ignore
					Array.prototype.splice.apply(parent.children, [index, 1].concat(nodes));
					// Do not visit this node's children or the newly added nodes
					return [SKIP, index + nodes.length];
				});
			}
		});
}

/**
 *
 * @param node
 * @param parent
 * @param inlineLink
 * @param config
 */
function getNodes(
	node: Text,
	parent: Element,
	inlineLink: boolean,
	config: NgDocHtmlPostProcessorConfig,
): Array<Element | Text> {
	const KeywordRegExp: RegExp = /([A-Za-z0-9_.-/*]+)/;
	const {addUsedKeyword, addPotentialKeyword, getKeyword, raiseError} = config;

	if (!getKeyword || !addUsedKeyword || !addPotentialKeyword) {
		throw new Error('Missing config');
	}

	return toString(node)
		.split(KeywordRegExp)
		.filter((word: string) => word.length)
		.map((word: string) => {
			const keyword: NgDocKeyword | undefined = getKeyword(word);

			if (KeywordRegExp.test(word)) {
				keyword ? addUsedKeyword(word) : addPotentialKeyword(word);
			}

			if (inlineLink && /^\*\w+/gm.test(word) && !keyword) {
				raiseError(new Error(`Route with keyword "${word}" is missing.`));
			}

			// Convert code tag to link if it's a link to the page entity
			if (inlineLink && keyword?.isCodeLink === false) {
				parent.tagName = 'a';
				parent.properties = {href: keyword.path};

				return {type: 'text', value: keyword.title};
			} else if (inlineLink && keyword && parent.properties) {
				parent.properties['class'] = [NG_DOC_ELEMENT, 'ng-doc-code-with-link'];
			}

			// Add link inside the code if it's a link to the API entity
			return keyword
				? createLinkNode(inlineLink ? keyword.title : word, keyword.path, keyword.type)
				: {type: 'text', value: word};
		});
}

/**
 *
 * @param text
 * @param href
 * @param type
 */
function createLinkNode(text: string, href: string, type?: string): Element {
	return {
		type: 'element',
		tagName: 'a',
		properties: {href: href, class: ['ng-doc-code-anchor', NG_DOC_ELEMENT], 'data-link-type': type},
		children: [{type: 'text', value: text}],
	};
}
