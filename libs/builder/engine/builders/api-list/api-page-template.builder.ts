import { kebabCase, NgDocApiScope } from '@ng-doc/core';
import { finalize, merge, takeUntil } from 'rxjs';
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
    id: `${declPath}#ApiTemplate`,
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
            getContent: async () => {
              await metadata.refresh();

              // refreshed declaration
              const declaration = metadata.entry.declaration;

              return renderTemplate('./api-page-content.html.nunj', {
                context: {
                  declaration,
                  docNode: Node.isVariableDeclaration(declaration)
                    ? declaration.getVariableStatement()
                    : declaration,
                  templateName: kebabCase(declaration.getKindName()),
                  scope,
                },
              });
            },
          }),
        ],
        async (content) => {
          return {
            metadata: tabMetadata,
            output: postProcess(content),
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
    takeUntil(merge(watchFile(declPath, 'delete'), metadata.selfDestroy)),
    finalize(() => {
      PageStore.delete(pageKey);
    }),
  );
}
