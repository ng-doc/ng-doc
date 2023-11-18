import { NgDocEntityAnchor, NgDocHeading } from '@ng-doc/core';
import GithubSlugger from 'github-slugger';
import { Element, Root } from 'hast';
import { hasProperty } from 'hast-util-has-property';
import { headingRank } from 'hast-util-heading-rank';
import { toString } from 'hast-util-to-string';
import { visit } from 'unist-util-visit';

import { attrValue } from '../helpers';

/**
 *
 * @param tree
 * @param addAnchor
 * @param headings
 */
export default function sluggerPlugin(
	addAnchor: (anchor: NgDocEntityAnchor) => void,
	headings?: NgDocHeading[],
) {
	headings = headings || ['h1', 'h2', 'h3', 'h4'];
	const slugger: GithubSlugger = new GithubSlugger();

	return (tree: Root) => {
		slugger.reset();

		visit(tree, 'element', (node: Element) => {
			const isHeading =
				headingRank(node) &&
				!hasProperty(node, 'id') &&
				headings?.includes(node.tagName.toLowerCase() as NgDocHeading);
			const attrSlug: string | undefined = attrValue(node, 'dataSlug');
			const attrSlugTitle: string | undefined = attrValue(node, 'dataSlugTitle');
			const attrSlugType: string | undefined = attrValue(node, 'dataSlugType');

			const dataToSlug: string | undefined = isHeading ? toString(node) : attrSlug;

			if (dataToSlug) {
				if (node.properties) {
					const id: string =
						attrSlug && attrSlugType === 'member' ? attrSlug : slugger.slug(dataToSlug);

					node.properties['id'] = id;

					addAnchor({
						anchor: id,
						title: attrSlugTitle || dataToSlug,
						type:
							(isHeading && attrSlugType !== 'member') || (attrSlug && attrSlugType === 'heading')
								? 'heading'
								: 'member',
					});
				}
			}
		});
	};
}
