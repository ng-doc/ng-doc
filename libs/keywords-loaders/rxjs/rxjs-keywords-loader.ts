import { NgDocKeywordsLoader } from '@ng-doc/core';

import { fetchDocs, rxjsPageToKeyword } from './helpers';
import { RxjsVersion } from './types';

/**
 * @param version rxjs version
 */
export function rxjsKeywordsLoader(version?: RxjsVersion): NgDocKeywordsLoader {
  return async () => {
    try {
      const apiReference = await fetchDocs(version);

      const keywords = apiReference.flatMap((ref) =>
        ref.items.map((item) => rxjsPageToKeyword(item, version)),
      );

      return Object.fromEntries(keywords);
    } catch (error: unknown) {
      console.error(`Failed to load RxJS keywords:`, error);

      return {};
    }
  };
}
