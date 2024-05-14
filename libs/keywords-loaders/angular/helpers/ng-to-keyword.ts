import { NgDocGlobalKeyword } from '@ng-doc/core';

import { NgPage } from '../interfaces';
import { NgVersion } from '../types';
import { getNgHost } from './get-ng-host';

/**
 *
 * @param page
 * @param version
 */
export function ngPageToKeyword(
  page: NgPage,
  version?: NgVersion,
): Array<[string, NgDocGlobalKeyword]> {
  const url: string = `${getNgHost(version)}/${page.path}`;
  const key: string = page.title.replace(/\n/g, '');
  const description: string = `External link the Angular documentation.`;

  switch (page.type) {
    case 'decorator':
      return [
        [page.title, { title: page.title, url, description }],
        [`@${page.title}`, { title: `@${page.title}`, url, description }],
      ];
    default:
      return [[key, { title: page.title, url, description }]];
  }
}
