import {NgDocHeading} from '@ng-doc/core';

const slugs = require('github-slugger')();
const has = require('hast-util-has-property');
const rank = require('hast-util-heading-rank');
const toString = require('hast-util-to-string');
const visit = require('unist-util-visit');

/**
 *
 * @param tree
 * @param headings
 */
export default function slugger(headings?: NgDocHeading[]): any {
	headings = headings || ['h1', 'h2', 'h3', 'h4'];

	return (tree: any) => {
		slugs.reset();

		visit(tree, 'element', (node: any) => {
			if (rank(node) && !has(node, 'id') && headings?.includes(node.tagName.toLowerCase())) {
				node.properties.id = slugs.slug(toString(node));
			}
		});
	};
}
