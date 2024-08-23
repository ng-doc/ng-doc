import { NgDocGlobalKeyword, NgDocKeyword, NgDocKeywordsLoader } from '@ng-doc/core';

import { fetchKeywords } from './helpers';
import { NgDocKeywordsLoaderOptions } from './interfaces';

/**
 * Loads keywords from an external NgDoc documentation.
 * You can use it to integrate your documentation with another NgDoc documentation and use its API or Pages keywords.
 * @param options - The options for the NgDoc keywords loader.
 */
export function ngDocKeywordsLoader(options: NgDocKeywordsLoaderOptions): NgDocKeywordsLoader {
  return async () => {
    const endpoint: string = options.endpoint.replace(/\/$/, '');
    const assets: string = options.assetsPath ?? '/assets/ng-doc';
    const keywords: Record<string, NgDocKeyword> = await fetchKeywords(`${endpoint}${assets}`);

    return Object.keys(keywords).reduce((acc: Record<string, NgDocGlobalKeyword>, key: string) => {
      const { title, path, description, type }: NgDocKeyword = keywords[key];
      const url: string = `${endpoint}${path}`;
      const isGuideKeyword = key.startsWith('*');

      if (isGuideKeyword && options.loadGuides) {
        const prefix: string = options.guidesPrefix ?? '';
        const newKey: string = `*${prefix}${key.replace(/^\*/, '')}`;

        acc[newKey] = {
          title: title ?? key,
          url,
          description,
          type,
        };
      } else {
        acc[key] = {
          title: title ?? key,
          url,
          description,
          type,
        };
      }

      return acc;
    }, {});
  };
}
