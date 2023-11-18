import { Element, Root } from 'hast';
import { isElement } from 'hast-util-is-element';
import { visit } from 'unist-util-visit';

import { hasClass } from '../helpers';

const HEADINGS: string[] = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
const NO_ANCHOR_CLASS: string = 'no-anchor';

/**
 *
 * @param options
 * @param route
 */
export default function autolinkHeading(route?: string): any {
	return (tree: Root) =>
		visit(tree, 'element', (node: Element) => {
			if (
				route &&
				isElement(node, HEADINGS) &&
				node.properties &&
				node.properties['id'] &&
				!hasClass(node, NO_ANCHOR_CLASS)
			) {
				node.children.push({
					type: 'element',
					tagName: 'a',
					properties: {
						title: 'Link to heading',
						className: ['ng-doc-header-link'],
						href: `${route}#${node.properties['id']}`,
					},
					children: [
						{
							type: 'element',
							tagName: 'ng-doc-icon',
							properties: {
								icon: 'link-2',
								size: 16,
							},
							children: [],
						},
					],
				});
			}
		});
}
