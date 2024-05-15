import { kebabCase, NgDocApiScope } from '@ng-doc/core';
import { finalize, takeUntil } from 'rxjs';
import { Node } from 'ts-morph';

import { NgDocBuilderContext } from '../../../interfaces';
import { Builder, CacheStrategy, factory, PageStore, watchFile } from '../../core';
import { renderTemplate } from '../../nunjucks';
import {
  DeclarationEntry,
  DeclarationTabEntry,
  EntryMetadata,
  TemplateBuilderOutput,
} from '../interfaces';
import { contentBuilder, pageComponentBuilder } from '../shared';
import { buildApiKeywords } from './keywords/build-api-keywords';

interface Config {
  context: NgDocBuilderContext;
  metadata: EntryMetadata<DeclarationEntry>;
  tabMetadata: EntryMetadata<DeclarationTabEntry>;
  scope?: NgDocApiScope;
}

export const API_PAGE_TEMPLATE_BUILDER_TAG = 'ApiPageTemplate';
export const API_BUILDER_TAG = 'Api';

/**
 *
 * @param config
 */
export function apiPageTemplateBuilder(config: Config): Builder<TemplateBuilderOutput> {
  const { context, metadata, tabMetadata, scope } = config;
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

  return pageComponentBuilder(
    (postProcess) =>
      factory(
        API_PAGE_TEMPLATE_BUILDER_TAG,
        [
          contentBuilder({
            tag: API_BUILDER_TAG,
            context,
            mainFilePath: declPath,
            cacheId: `${declPath}#Api`,
            metadata: tabMetadata,
            getKeywords: buildApiKeywords(metadata),
            getContent: async () =>
              renderTemplate('./api-page-content.html.nunj', {
                context: {
                  declaration,
                  docNode: Node.isVariableDeclaration(declaration)
                    ? declaration.getVariableStatement()
                    : declaration,
                  templateName: kebabCase(declaration.getKindName()),
                  scope,
                },
              }),
          }),
        ],
        async (output) => {
          return {
            metadata: tabMetadata,
            output: postProcess(output),
          } satisfies TemplateBuilderOutput;
        },
        cacheStrategy,
      ),
    {
      context,
      metadata: tabMetadata,
      pageType: 'api',
      lineNumber: declaration.getStartLineNumber(),
    },
  ).pipe(
    finalize(() => PageStore.delete(pageKey)),
    takeUntil(watchFile(declPath, 'delete')),
  );
}
