import {NgDocGlobalKeyword} from '@ng-doc/core';

import {ngApiPageTypes} from '../constants';
import {NgPage} from '../interfaces';
import {NgVersion} from '../types';
import {getNgHost} from './get-ng-host';

/**
 *
 * @param page
 * @param version
 */
export function ngPageToKeyword(page: NgPage, version?: NgVersion): Array<[string, NgDocGlobalKeyword]> {
	const path: string = `${getNgHost(version)}/${page.path}`;
	const isCodeLink: boolean = ngApiPageTypes.includes(page.type);
	const key: string = isCodeLink ? page.title : page.title.replace(/\n/g, '');
	const description: string = `External link to the "${page.title}" page in the Angular documentation.`;

	switch (page.type) {
		case 'decorator':
			return [
				[page.title, {title: page.title, url: path, isCodeLink, description}],
				[`@${page.title}`, {title: `@${page.title}`, url: path, isCodeLink, description}],
			];
		default:
			return [[key, {title: page.title, url: path, isCodeLink, description}]];
	}
}
