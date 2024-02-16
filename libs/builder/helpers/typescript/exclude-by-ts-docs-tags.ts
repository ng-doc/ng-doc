import { asArray } from '@ng-doc/core';
import { JSDocableNode } from 'ts-morph';

/**
 *
 * @param nodes
 * @param tags
 */
export function excludeByTsDocsTags<T extends JSDocableNode>(
	nodes: T[],
	tags: string | string[],
): T[] {
	return nodes.filter((node: T) => {
		return !node
			.getJsDocs()
			.some((jsDoc) => jsDoc.getTags().some((tag) => asArray(tags).includes(tag.getTagName())));
	});
}
