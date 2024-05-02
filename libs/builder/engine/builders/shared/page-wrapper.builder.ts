import {
  createImportPath,
  IndexStore,
  NgDocBuilderContext,
  replaceKeywords,
} from '@ng-doc/builder';
import { NgDocPageType, uid } from '@ng-doc/core';
import { finalize } from 'rxjs';

import { buildIndexes } from '../../../helpers/build-indexes';
import { AsyncFileOutput, Builder, CacheStrategy, mergeFactory } from '../../core';
import { renderTemplate } from '../../nunjucks';
import { EntryMetadata, TemplateBuilderOutput } from '../interfaces';

interface Config {
  tag: string;
  context: NgDocBuilderContext;
  metadata: EntryMetadata;
  pageType: NgDocPageType;
  pageTemplateBuilders: Array<Builder<TemplateBuilderOutput>>;
}

/**
 *
 * @param config
 */
export function pageWrapperBuilder(config: Config): Builder<AsyncFileOutput> {
  const { tag, context, metadata, pageTemplateBuilders, pageType } = config;
  const cacheStrategy = {
    id: `${metadata.path}#PageWrapper`,
    action: 'skip',
  } satisfies CacheStrategy<undefined, string>;
  let removeIndexes: () => void = () => {};

  return mergeFactory(
    tag,
    pageTemplateBuilders,
    async (...templates) => {
      removeIndexes();

      const headerTemplatePath = context.config.guide?.headerTemplate;
      const headerContent = renderTemplate(headerTemplatePath ?? './page-header.html.nunj', {
        scope: headerTemplatePath ? context.context.workspaceRoot : undefined,
        context: {
          page: metadata.entry,
        },
      });
      const entries = getPageWrapperPages(metadata, templates);

      return async () => {
        // TODO: maybe move replacing keywords and building indexes to a separate entity to reuse it in page-component.builder.ts
        const content = await replaceKeywords(headerContent);
        const indexes = await buildIndexes({
          content,
          title: metadata.title,
          breadcrumbs: metadata.breadcrumbs(),
          pageType,
          route: metadata.absoluteRoute(),
        });

        removeIndexes = IndexStore.add(...indexes);

        return {
          filePath: metadata.outPath,
          content: renderTemplate('./page-wrapper.ts.nunj', {
            context: {
              id: uid(),
              metadata,
              entries,
              headerContent,
              hasBreadcrumb: !!metadata.breadcrumbs().length,
            },
          }),
        };
      };
    },
    cacheStrategy,
    ({ output }) => output,
  ).pipe(
    finalize(() => {
      removeIndexes();
    }),
  );
}

/**
 *
 * @param pageMetadata
 * @param templates
 */
function getPageWrapperPages(pageMetadata: EntryMetadata, templates: TemplateBuilderOutput[]) {
  return templates.reduce(
    (pages, { metadata }) => ({
      ...pages,
      [createImportPath(pageMetadata.outDir, metadata.outPath)]: {
        ...metadata,
      },
    }),
    {},
  );
}
