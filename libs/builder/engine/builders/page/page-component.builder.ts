import {
  CacheStrategy,
  createImportPath,
  keywordsStore,
  PAGE_NAME,
  whenBuildersStackIsEmpty,
} from '@ng-doc/builder';
import { NgDocPage, uid } from '@ng-doc/core';
import path from 'path';
import { switchMap } from 'rxjs/operators';

import { editFileInRepoUrl, viewFileInRepoUrl } from '../../../helpers';
import { NgDocBuilderContext } from '../../../interfaces';
import { Builder, factory, FileOutput } from '../../core';
import { renderTemplate } from '../../nunjucks';
import { EntryMetadata } from '../interfaces';
import { replaceKeywords } from '../shared/replace-keywords';
import { PAGE_TEMPLATE_BUILDER_TAG, pageTemplateBuilder } from './page-template.builder';

interface Config {
  context: NgDocBuilderContext;
  page: EntryMetadata<NgDocPage>;
}

export const PAGE_COMPONENT_BUILDER_TAG = 'PageComponent';

/**
 *
 * @param config
 */
export function pageComponentBuilder(config: Config): Builder<FileOutput> {
  const { context, page } = config;
  const mdPath = path.join(page.dir, page.entry.mdFile);
  const outPath = path.join(page.outDir, 'page.ts');

  const cacheStrategy = {
    id: `${mdPath}#Component`,
    action: 'skip',
  } satisfies CacheStrategy<undefined, string>;

  return whenBuildersStackIsEmpty([PAGE_TEMPLATE_BUILDER_TAG]).pipe(
    switchMap(() =>
      factory(
        PAGE_COMPONENT_BUILDER_TAG,
        [pageTemplateBuilder({ context, page })],
        async (html: string) => {
          const content = await replaceKeywords(html, {
            getKeyword: keywordsStore.get.bind(keywordsStore),
          });
          const entryImportPath = createImportPath(page.outDir, path.join(page.dir, PAGE_NAME));
          const editSourceFileUrl =
            context.config.repoConfig &&
            editFileInRepoUrl(context.config.repoConfig, mdPath, page.route);
          const viewSourceFileUrl =
            context.config.repoConfig && viewFileInRepoUrl(context.config.repoConfig, mdPath);

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
        },
        cacheStrategy,
      ),
    ),
  );
}
