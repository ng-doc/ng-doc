import { DeclarationEntry, PageStore, renderTemplate, watchFile } from '@ng-doc/builder';
import { kebabCase, NgDocApiScope } from '@ng-doc/core';
import { finalize, takeUntil } from 'rxjs';

import { getApiForDeclaration } from '../../../helpers/api/get-api-for-declaration';
import { NgDocBuilderContext } from '../../../interfaces';
import { AsyncFileOutput, Builder, CacheStrategy, factory } from '../../core';
import { createTemplatePostProcessor } from '../helpers';
import { EntryMetadata } from '../interfaces';
import { contentBuilder } from '../shared';

interface Config {
  context: NgDocBuilderContext;
  metadata: EntryMetadata<DeclarationEntry>;
  scope?: NgDocApiScope;
}

export const API_PAGE_TEMPLATE_BUILDER_TAG = 'ApiPageTemplate';
export const API_BUILDER_TAG = 'Api';

/**
 *
 * @param config
 */
export function apiPageTemplateBuilder(config: Config): Builder<AsyncFileOutput> {
  const { context, metadata, scope } = config;
  const {
    entry: { declaration },
  } = metadata;
  const declPath = declaration.getSourceFile().getFilePath();
  const pageKey = `${declPath}#${declaration.getName()}`;
  const cacheStrategy = {
    id: `${declPath}#Template`,
    action: 'skip',
  } satisfies CacheStrategy<undefined, string>;

  PageStore.add([pageKey, metadata]);

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
            metadata,
            keyword: declaration.getName(),
            keywordType: 'api',
            getContent: async () =>
              renderTemplate('./api-page-content.html.nunj', {
                context: {
                  api: getApiForDeclaration(declaration),
                  templateName: kebabCase(declaration.getKindName()),
                  scope,
                },
              }),
          }),
        ],
        async (html) => postProcess(html),
        cacheStrategy,
      ),
    {
      context,
      metadata: metadata,
      pageType: 'api',
      lineNumber: declaration.getStartLineNumber(),
    },
  ).pipe(
    finalize(() => PageStore.delete(pageKey)),
    takeUntil(watchFile(declPath, 'delete')),
  );
}
