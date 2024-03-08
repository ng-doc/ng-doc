import { createImportPath, IndexStore, PAGE_NAME, replaceKeywords } from '@ng-doc/builder';
import { NgDocPage, uid } from '@ng-doc/core';
import path from 'path';
import { finalize } from 'rxjs';

import { editFileInRepoUrl, viewFileInRepoUrl } from '../../../helpers';
import { buildIndexes } from '../../../helpers/build-indexes';
import { NgDocBuilderContext } from '../../../interfaces';
import { AsyncFileOutput, Builder, CacheStrategy, factory, keywordsStore } from '../../core';
import { renderTemplate } from '../../nunjucks';
import { EntryMetadata } from '../interfaces';
import { guideBuilder } from './guide.builder';

interface Config {
  context: NgDocBuilderContext;
  page: EntryMetadata<NgDocPage>;
}

export const PAGE_TEMPLATE_BUILDER_TAG = 'PageTemplate';

/**
 *
 * @param config
 */
export function pageTemplateBuilder(config: Config): Builder<AsyncFileOutput> {
  const { context, page } = config;
  const mdPath = path.join(page.dir, page.entry.mdFile);
  const cacheStrategy = {
    id: `${mdPath}#Template`,
    action: 'skip',
  } satisfies CacheStrategy<undefined, string>;

  let removeIndexes: () => void = () => {};

  return factory(
    PAGE_TEMPLATE_BUILDER_TAG,
    [guideBuilder({ context, mdPath, page })],
    (guide: string) => {
      removeIndexes();

      const html = renderTemplate('./page-template.nunj', {
        context: {
          tabs: [
            { title: 'Guide', content: guide },
            { title: 'API', content: '' },
          ],
        },
      });

      // Replace keywords in the template at the end of the build process
      return async () => {
        const outPath = path.join(page.outDir, 'page.ts');
        const content = await replaceKeywords(html, {
          getKeyword: keywordsStore.get.bind(keywordsStore),
        });
        const entryImportPath = createImportPath(page.outDir, path.join(page.dir, PAGE_NAME));
        const editSourceFileUrl =
          context.config.repoConfig &&
          editFileInRepoUrl(context.config.repoConfig, mdPath, page.route);
        const viewSourceFileUrl =
          context.config.repoConfig && viewFileInRepoUrl(context.config.repoConfig, mdPath);

        removeIndexes = IndexStore.add(
          ...(await buildIndexes({
            content,
            title: page.entry.title,
            breadcrumbs: page.breadcrumbs(),
            pageType: 'guide',
            route: page.absoluteRoute(),
          })),
        );

        return {
          filePath: outPath,
          content: renderTemplate('./page.ts.nunj', {
            context: {
              id: uid(),
              content,
              routePrefix: context.config.routePrefix,
              page: page.entry,
              entryImportPath,
              editSourceFileUrl,
              viewSourceFileUrl,
            },
          }),
        };
      };
    },
    cacheStrategy,
  ).pipe(finalize(removeIndexes));
}
