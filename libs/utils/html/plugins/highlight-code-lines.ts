import {Element, ElementContent, Root} from 'hast';
import {visit} from 'unist-util-visit';

import {attrValue, isElement} from '../helpers';

/**
 * Highlight code lines
 */
export default function highlightCodeLines() {
	return (tree: Root) => {
		visit(tree, 'element', (node: Element, _i, parent: Root | Element | null) => {
			if (parent?.type === 'element' && parent.tagName === 'pre' && node.tagName === 'code') {
				const highlightedLines: number[] = JSON.parse(attrValue(node, 'highlightedLines') ?? '[]');

				highlightedLines.length &&
					node.children.forEach((child: ElementContent, i: number) => {
						// eslint-disable-next-line @typescript-eslint/ban-ts-comment
						// @ts-ignore
						if (isElement(child) && child.properties.class?.includes('line')) {
							if (highlightedLines.includes(i + 1)) {
								// eslint-disable-next-line @typescript-eslint/ban-ts-comment
								// @ts-ignore
								child.properties.class.push('highlighted');
							}
						}
					});
			}
		});
	};
}
