import { NgDocActions, renderTemplateString } from '@ng-doc/builder';
import { NgDocPage } from '@ng-doc/core';
import path from 'path';
import { takeUntil } from 'rxjs';

import { markdownToHtml } from '../../../helpers';
import { NgDocBuilderContext } from '../../../interfaces';
import {
  Builder,
  CacheStrategy,
  createBuilder,
  createMainTrigger,
  factory,
  watchFile,
} from '../../core';
import { createMarkdownMetadata, markdownFrontMatter } from '../helpers';
import { EntryMetadata, TemplateBuilderOutput } from '../interfaces';
import { contentBuilder, pageComponentBuilder } from '../shared';
import { buildGuideKeywords } from './build-guide-keywords';

interface Config {
  context: NgDocBuilderContext;
  pageMetadata: EntryMetadata<NgDocPage>;
  mdFile: string;
}

export const GUIDE_TEMPLATE_BUILDER_TAG = 'GuideTemplate';
export const GUIDE_BUILDER_TAG = 'Guide';

/**
 *
 * @param config
 */
export function guideTemplateBuilder(config: Config): Builder<TemplateBuilderOutput> {
  const { context, mdFile, pageMetadata } = config;
  const mdPath = path.join(pageMetadata.dir, mdFile);
  const mdDir = path.dirname(mdPath);
  const cacheStrategy = {
    id: `${mdPath}#Template`,
    action: 'skip',
  } satisfies CacheStrategy<undefined, string>;

  return createBuilder([createMainTrigger(watchFile(mdPath, 'update'))], () => {
    const metadata = createMarkdownMetadata(pageMetadata, mdFile);

    return pageComponentBuilder(
      (postProcess) =>
        factory(
          GUIDE_TEMPLATE_BUILDER_TAG,
          [
            contentBuilder({
              tag: GUIDE_BUILDER_TAG,
              context,
              mainFilePath: mdPath,
              cacheId: `${mdPath}#Guide`,
              metadata,
              getKeywords: buildGuideKeywords(metadata),
              getContent: async (dependencies) => {
                const { content } = markdownFrontMatter(metadata.path);
                const mdContent = renderTemplateString(content, {
                  scope: metadata.dir,
                  context: {
                    NgDocPage: metadata.parent.entry,
                    NgDocActions: new NgDocActions(metadata, dependencies),
                  },
                  dependencies,
                  filters: false,
                });

                return markdownToHtml(mdContent, mdDir, dependencies.add.bind(dependencies));
              },
            }),
          ],
          async (output) => {
            return {
              metadata,
              output: postProcess(output),
            } satisfies TemplateBuilderOutput;
          },
          cacheStrategy,
        ),
      {
        context,
        metadata,
        pageType: 'guide',
        entryPath: pageMetadata.path,
        entryHasImports: !!pageMetadata.objectExpression.getProperty('imports'),
        demoAssetsPath: path.join(pageMetadata.outDir, 'demo-assets.ts'),
        playgroundsPath: path.join(pageMetadata.outDir, 'playgrounds.ts'),
      },
    );
  }).pipe(takeUntil(watchFile(mdPath, 'delete')));
}
