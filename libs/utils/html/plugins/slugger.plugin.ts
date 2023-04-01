import {NgDocHeading} from '@ng-doc/core';
import GithubSlugger from 'github-slugger';
import {Element, Root} from 'hast';
import {hasProperty} from 'hast-util-has-property';
import {headingRank} from 'hast-util-heading-rank';
import {toString} from 'hast-util-to-string';
import {visit} from 'unist-util-visit';

/**
 *
 * @param tree
 * @param headings
 */
export default function sluggerPlugin(headings?: NgDocHeading[]) {
	headings = headings || ['h1', 'h2', 'h3', 'h4'];
	const slugger = new GithubSlugger();

	return (tree: Root) => {
		slugger.reset();

		visit(tree, 'element', (node: Element) => {
			if (
				headingRank(node) &&
				!hasProperty(node, 'id') &&
				headings?.includes(node.tagName.toLowerCase() as NgDocHeading)
			) {
				if (node.properties) {
					node.properties['id'] = slugger.slug(toString(node));
				}
			}
		});
	};
}
