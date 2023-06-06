import {NgDocEntityKeyword} from '@ng-doc/builder';
import {NgDocEntityAnchor} from '@ng-doc/core';

/**
 *
 * @param key
 * @param title
 * @param path
 * @param anchor
 */
export function buildEntityKeyword(
	key: string,
	title: string,
	path: string,
	anchor: NgDocEntityAnchor,
): NgDocEntityKeyword {
	if (anchor.type === 'heading') {
		return {
			key: `${key}#${anchor.anchor}`,
			title: `${title} [${anchor.title}]`,
			path: `${path}#${anchor.anchor}`,
		};
	} else {
		return {
			key: `${key}.${anchor.anchor}`,
			title: `${title}.${anchor.title}`,
			path: `${path}#${anchor.anchor}`,
		};
	}
}
