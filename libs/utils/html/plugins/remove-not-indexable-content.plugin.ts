import {Element, Root} from 'hast';
import {filter} from 'unist-util-filter';

import {isCodeNode} from '../helpers';

/**
 *
 * @param tree
 * @param headings
 */
export default function removeNotIndexableContentPlugin(): any {
	return (tree: Root) => {
		// eslint-disable-next-line @typescript-eslint/ban-ts-comment
		// @ts-ignore
		return filter(tree, {cascade: false}, (node: Element) => {
			// eslint-disable-next-line @typescript-eslint/ban-ts-comment
			// @ts-ignore
			const preWithCode: boolean = node?.tagName === 'pre' && node?.children?.some(isCodeNode);
			const notIndexable: boolean = node?.properties?.['indexable'] === 'false';

			return !node?.tagName || (!preWithCode && !notIndexable && !isCodeNode(node));
		});
	};
}
