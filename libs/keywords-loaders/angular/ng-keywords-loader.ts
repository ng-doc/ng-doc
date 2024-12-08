import { NgDocKeywordsLoader } from '@ng-doc/core';

import { fetchDocs, ngPageToKeyword } from './helpers';
import { NgKeywordLoaderOptions } from './interfaces';

/**
 * Loads keywords from Angular documentation.
 * This loader will fetch the documentation from the Angular website and
 * extract the keywords from the API pages which will transform them all mentioning
 * of the Angular API into links to the Angular documentation.
 * @param options
 */
export function ngKeywordsLoader(options?: NgKeywordLoaderOptions): NgDocKeywordsLoader {
  return async () => {
    try {
      const packages = await fetchDocs(options?.version);

      const keywords = packages.flatMap(({ moduleName, entries }) =>
        entries.flatMap((page) => ngPageToKeyword(moduleName, page, options?.version)),
      );

      return Object.fromEntries(keywords);
    } catch (error: unknown) {
      console.error(`Failed to load Angular keywords: ${error}`);

      return {};
    }
  };
}
