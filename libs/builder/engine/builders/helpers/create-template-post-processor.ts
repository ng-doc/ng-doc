import { uid } from '@ng-doc/core';
import path from 'path';
import { finalize } from 'rxjs';

import { editFileInRepoUrl, viewFileInRepoUrl } from '../../../helpers';
import { buildIndexes } from '../../../helpers/build-indexes';
import { NgDocBuilderContext } from '../../../interfaces';
import { AsyncFileOutput, Builder, IndexStore, keywordsStore } from '../../core';
import { renderTemplate } from '../../nunjucks';
import { PAGE_NAME } from '../../variables';
import { EntryMetadata, PageEntry } from '../interfaces';
import { replaceKeywords } from '../shared';
import { createImportPath } from './create-import-path';

interface Config {
  context: NgDocBuilderContext;
  metadata: EntryMetadata<PageEntry>;
  templatePath: string;
  lineNumber?: number;
}

type PostProcess = (html: string) => AsyncFileOutput;

/**
 *
 * @param builder
 * @param config
 */
export function createTemplatePostProcessor(
  builder: (postProcess: PostProcess) => Builder<AsyncFileOutput>,
  config: Config,
): Builder<AsyncFileOutput> {
  const { context, metadata, templatePath, lineNumber } = config;
  let removeIndexes: () => void = () => {};

  return builder((html: string) => {
    removeIndexes();

    // Replace keywords in the template at the end of the build process
    return async () => {
      const outPath = path.join(metadata.outDir, 'page.ts');
      const content = await replaceKeywords(html, {
        getKeyword: keywordsStore.get.bind(keywordsStore),
      });
      const entryImportPath = createImportPath(metadata.outDir, path.join(metadata.dir, PAGE_NAME));
      const editSourceFileUrl =
        context.config.repoConfig &&
        editFileInRepoUrl(context.config.repoConfig, templatePath, metadata.route, lineNumber);
      const viewSourceFileUrl =
        context.config.repoConfig &&
        viewFileInRepoUrl(context.config.repoConfig, templatePath, lineNumber);

      removeIndexes = IndexStore.add(
        ...(await buildIndexes({
          content,
          title: metadata.entry.title,
          breadcrumbs: metadata.breadcrumbs(),
          pageType: 'api',
          route: metadata.absoluteRoute(),
        })),
      );

      return {
        filePath: outPath,
        content: renderTemplate('./page.ts.nunj', {
          context: {
            id: uid(),
            content,
            routePrefix: context.config.routePrefix,
            page: metadata.entry,
            entryImportPath,
            editSourceFileUrl,
            viewSourceFileUrl,
            pageType: 'api',
          },
        }),
      };
    };
  }).pipe(finalize(removeIndexes));
}
