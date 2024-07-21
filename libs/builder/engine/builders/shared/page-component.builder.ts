import { NgDocPageType, uid } from '@ng-doc/core';
import path from 'path';
import { finalize } from 'rxjs';

import { editFileInRepoUrl, UTILS, viewFileInRepoUrl } from '../../../helpers';
import { buildIndexes } from '../../../helpers/build-indexes';
import { NgDocBuilderContext } from '../../../interfaces';
import { AsyncFileOutput, Builder, IndexStore, keywordsStore } from '../../core';
import { renderTemplate } from '../../nunjucks';
import { ContentEntry, EntryMetadata } from '../interfaces';

interface Config {
  context: NgDocBuilderContext;
  metadata: EntryMetadata<ContentEntry>;
  pageType: NgDocPageType;
  entryHasImports?: boolean;
  entryPath?: string;
  demoAssetsPath?: string;
  playgroundsPath?: string;
  lineNumber?: number;
}

type PostProcess = (html: string) => AsyncFileOutput;

/**
 *
 * @param builder
 * @param config
 */
export function pageComponentBuilder<T>(
  builder: (postProcess: PostProcess) => Builder<T>,
  config: Config,
): Builder<T> {
  const {
    context,
    metadata,
    pageType,
    entryPath,
    entryHasImports,
    demoAssetsPath,
    playgroundsPath,
    lineNumber,
  } = config;
  let removeIndexes: () => void = () => {};

  return builder((html: string) => {
    removeIndexes();

    // Replace keywords in the template at the end of the build process
    return async () => {
      try {
        const content = await UTILS.replaceKeywords(html, {
          getKeyword: keywordsStore.get.bind(keywordsStore),
        });
        const editSourceFileUrl =
          context.config.repoConfig &&
          editFileInRepoUrl(
            context.config.repoConfig,
            path.relative(context.context.workspaceRoot, metadata.path),
            metadata.route,
            lineNumber,
          );
        const viewSourceFileUrl =
          context.config.repoConfig &&
          viewFileInRepoUrl(
            context.config.repoConfig,
            path.relative(context.context.workspaceRoot, metadata.path),
            lineNumber,
          );
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
              metadata,
              editSourceFileUrl,
              viewSourceFileUrl,
              pageType,
              entryPath,
              entryHasImports,
              demoAssetsPath,
              playgroundsPath,
            },
          }),
        };
      } catch (cause) {
        throw new Error(`Failed to build page: file:///${metadata.path}`, { cause });
      }
    };
  }).pipe(finalize(() => removeIndexes));
}
