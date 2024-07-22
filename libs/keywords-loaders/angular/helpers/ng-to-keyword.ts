import { NgDocGlobalKeyword } from '@ng-doc/core';

import { NgPage } from '../interfaces';
import { NgVersion } from '../types';
import { getApiUrl } from './get-api-url';

/**
 *
 * @param packageName
 * @param page
 * @param version
 */
export function ngPageToKeyword(
  packageName: string,
  page: NgPage,
  version?: NgVersion,
): Array<[string, NgDocGlobalKeyword]> {
  const url: string = getApiUrl(packageName, page.name, version);
  const description: string = `External link the Angular documentation.`;
  const keywords: Array<[string, NgDocGlobalKeyword]> = [
    [page.name, { title: page.name, url, description }],
  ];

  if (page.type === 'decorator') {
    keywords.push([`@${page.name}`, { title: `@${page.name}`, url, description }]);
  }

  return keywords;
}
