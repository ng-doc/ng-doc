import { NgDocGlobalKeyword } from '@ng-doc/core';

import { RxjsPage } from '../interfaces';
import { RxjsVersion } from '../types';
import { getApiUrl } from './get-api-url';

/**
 *
 * @param page
 * @param version
 */
export function rxjsPageToKeyword(
  page: RxjsPage,
  version?: RxjsVersion,
): [string, NgDocGlobalKeyword] {
  return [
    page.title,
    {
      title: page.title,
      url: getApiUrl(page.path, version),
      description: `External link the RxJS documentation.`,
    },
  ];
}
