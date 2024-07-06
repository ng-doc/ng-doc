import {
  createBuilder,
  createImportPath,
  IndexStore,
  NgDocBuilderContext,
} from '@ng-doc/builder';
import { NgDocPageType, uid } from '@ng-doc/core';
import { finalize } from 'rxjs';

import { UTILS } from '../../../helpers';
import { buildIndexes } from '../../../helpers/build-indexes';
import { AsyncFileOutput, Builder, CacheStrategy, mergeFactory } from '../../core';
import { renderTemplate } from '../../nunjucks';
import { EntryMetadata, TemplateBuilderOutput } from '../interfaces';

interface Config {
  tag: string;
  context: NgDocBuilderContext;
  metadata: EntryMetadata;
  pageType: NgDocPageType;
  getHeaderContent: () => string;
  pageTemplateBuilders: Array<Builder<TemplateBuilderOutput>>;
}

/**
 *
 * @param config
 */
export function pageWrapperBuilder(config: Config): Builder<AsyncFileOutput> {
  const { context, tag, metadata, pageTemplateBuilders, pageType, getHeaderContent } = config;
  const cacheStrategy = {
    id: `${metadata.path}#PageWrapper`,
    action: 'skip',
  } satisfies CacheStrategy<undefined, string>;
  let usedKeywords = new Set<string>();
  let removeIndexes: () => void = () => {};

  const builder = () =>
    mergeFactory(
      tag,
      pageTemplateBuilders,
      async (...templates) => {
        removeIndexes();
        usedKeywords.clear();

        const processed = await UTILS.htmlProcessor(getHeaderContent(), {
          headings: context.config.guide?.anchorHeadings,
          route: metadata.absoluteRoute(),
        });
        const postProcessed = await UTILS.postProcessHtml(processed.content);

        usedKeywords = new Set(postProcessed.usedKeywords);

        const entries = getPageWrapperPages(metadata, templates);

        return async () => {
          // TODO: maybe move replacing keywords and building indexes to a separate entity to reuse it in page-component.builder.ts
          const content = await UTILS.replaceKeywords(postProcessed.content);
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
                headerContent: content,
                hasBreadcrumb: !!metadata.breadcrumbs().length,
                pageType,
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

  // This trigger destroys child content builder. HEADER builder should be moved to a separate builder to avoid that
  return createBuilder(
    [
      /*createSecondaryTrigger(onKeywordsTouch(usedKeywords))*/
    ],
    builder,
    true,
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
