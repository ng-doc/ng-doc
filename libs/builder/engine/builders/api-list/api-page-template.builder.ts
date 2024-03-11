import { NgDocApi } from '@ng-doc/core';

import { NgDocBuilderContext } from '../../../interfaces';
import { NgDocSupportedDeclaration } from '../../../types';
import { AsyncFileOutput, Builder, CacheStrategy, factory } from '../../core';
import { createTemplatePostProcessor } from '../helpers';
import { EntryMetadata } from '../interfaces';
import { contentBuilder } from '../shared';

interface Config {
  context: NgDocBuilderContext;
  api: EntryMetadata<NgDocApi>;
  declaration: NgDocSupportedDeclaration;
}

export const API_PAGE_TEMPLATE_BUILDER_TAG = 'ApiPageTemplate';
export const API_BUILDER_TAG = 'Api';

/**
 *
 * @param config
 */
export function apiPageTemplateBuilder(config: Config): Builder<AsyncFileOutput> {
  const { context, api, declaration } = config;
  const declPath = declaration.getSourceFile().getFilePath();
  const cacheStrategy = {
    id: `${declPath}#Template`,
    action: 'skip',
  } satisfies CacheStrategy<undefined, string>;

  return createTemplatePostProcessor(
    (postProcess) =>
      factory(
        API_PAGE_TEMPLATE_BUILDER_TAG,
        [
          contentBuilder({
            tag: API_BUILDER_TAG,
            context,
            mainFilePath: declPath,
            cacheId: `${declPath}#Api`,
            entry: api,
            keyword: declaration.getName(),
            keywordType: 'api',
            getContent: () => '',
          }),
        ],
        postProcess,
        cacheStrategy,
      ),
    {
      context,
      metadata: api,
      templatePath: declPath,
      lineNumber: declaration.getStartLineNumber(),
    },
  );
}
