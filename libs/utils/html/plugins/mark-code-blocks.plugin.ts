import { Element, Root } from 'hast';
import { visit } from 'unist-util-visit';

/**
 * Add hljs class to `pre` elements that contain `code` elements
 *
 * We need this to allow customization of the code block style
 *
 * @param tree
 * @param headings
 */
export default function markCodeBlocksPlugin(): any {
	return (tree: Root) => {
		visit(tree, 'element', (node: Element) => {
			if (
				node.tagName === 'pre' &&
				// eslint-disable-next-line @typescript-eslint/ban-ts-comment
				// @ts-ignore
				node.children?.some((child: Element) => child.tagName === 'code')
			) {
				if (node.properties) {
					// eslint-disable-next-line @typescript-eslint/ban-ts-comment
					// @ts-ignore
					node.properties['className'] = [...(node.properties?.['className'] ?? []), 'hljs'];
				}
			}
		});
	};
}
