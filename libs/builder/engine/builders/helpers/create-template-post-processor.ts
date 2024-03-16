import { NgDocPageType, uid } from '@ng-doc/core';
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
  pageType: NgDocPageType;
  lineNumber?: number;
}

type PostProcess = (html: string) => AsyncFileOutput;

/**
 *
 * @param builder
 * @param config
 */
export function createTemplatePostProcessor<T>(
  builder: (postProcess: PostProcess) => Builder<T>,
  config: Config,
): Builder<T> {
  const { context, metadata, templatePath, pageType, lineNumber } = config;
  let removeIndexes: () => void = () => {};

  return builder((html: string) => {
    removeIndexes();

    // Replace keywords in the template at the end of the build process
    return async () => {
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
        content: renderTemplate('./page.ts.nunj', {
          context: {
            id: uid(),
            content,
            page: metadata.entry,
            entryImportPath,
            editSourceFileUrl,
            viewSourceFileUrl,
            pageType,
          },
        }),
      };
    };
  }).pipe(finalize(removeIndexes));
}
