const is: any = require('hast-util-is-element');
const visit: any = require('unist-util-visit');

/**
 * Get remark to add IDs to headings and inject anchors into them.
 * This is a stripped-down equivalent of [rehype-autolink-headings](https://github.com/wooorm/rehype-autolink-headings)
 * that supports ignoring headings with the `no-anchor` class.
 */
const HEADINGS: string[] = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
const NO_ANCHOR_CLASS: string = 'no-anchor';

const hasClass: any = (node: any, cls: any) => {
	const className: string = node.properties.className;
	return className && className.includes(cls);
};


/**
 *
 * @param options
 */
export default function autolinkHeading(): any {
	return (tree: any) => visit(tree, (node: any) => {
		if (is(node, HEADINGS) && node.properties.id && !hasClass(node, NO_ANCHOR_CLASS)) {
			node.children.push({
				type: 'element',
				tagName: 'a',
				properties: {
					title: 'Link to heading',
					className: ['ng-doc-header-link'],
					href: `#${node.properties.id}`
				},
				children: [{
					type: 'element',
					tagName: 'ng-doc-icon',
					properties: {
						icon: "link-2",
						size: 24,
					},
				}]
			});
		}
	})
}
