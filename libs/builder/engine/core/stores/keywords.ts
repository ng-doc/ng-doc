import {
  asArray,
  NgDocGlobalKeyword,
  NgDocKeyword,
  NgDocKeywordsLoader,
  objectKeys,
} from '@ng-doc/core';

import { ObservableMap } from '../../../classes';
import { formatKeywordKey } from '../../../helpers';
import { NgDocBuilderContext } from '../../../interfaces';

export const keywordsStore = new ObservableMap<string, NgDocKeyword>();

/**
 *
 * @param context
 */
export async function loadGlobalKeywords(context: NgDocBuilderContext): Promise<void> {
  const keywordLoaders: NgDocKeywordsLoader[] = asArray(context.config?.keywords?.loaders);
  const keywords: Array<Record<string, NgDocGlobalKeyword>> = await Promise.all(
    keywordLoaders.map((loader: NgDocKeywordsLoader) => loader()),
  );

  keywords
    .concat(context.config?.keywords?.keywords ?? {})
    .forEach((keywords: Record<string, NgDocGlobalKeyword>) => {
      objectKeys(keywords).forEach((key: string) => {
        const keyword: NgDocGlobalKeyword | undefined = keywords[key];

        if (keyword) {
          keywordsStore.add([
            formatKeywordKey(key),
            {
              title: keyword.title ?? key,
              path: keyword.url,
              description: keyword.description,
              type: keyword.type,
            },
          ]);
        }
      });
    });
}
