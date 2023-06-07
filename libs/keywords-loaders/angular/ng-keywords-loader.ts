import {NgDocGlobalKeyword, NgDocKeywordsLoader} from '@ng-doc/core';

import {ngApiPageTypes} from './constants';
import {fetchDocs, ngPageToKeyword} from './helpers';
import {NgKeywordLoaderOptions, NgPage, NgResponse} from './interfaces';

/**
 * Loads keywords from Angular documentation.
 *
 * @param options
 */
export function ngKeywordsLoader(options?: NgKeywordLoaderOptions): NgDocKeywordsLoader {
	return async () => {
		const {pages}: NgResponse = await fetchDocs(options?.version);

		return pages
			.filter((page: NgPage) => page.path.startsWith('api'))
			.filter((page: NgPage) => ngApiPageTypes.includes(page.type))
			.map((page: NgPage) => ngPageToKeyword(page, options?.version))
			.flat()
			.reduce((keywords: Record<string, NgDocGlobalKeyword>, [key, keyword]: [string, NgDocGlobalKeyword]) => {
				keywords[key] = keyword;

				return keywords;
			}, {});
	};
}
