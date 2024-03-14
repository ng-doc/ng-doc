import {
  contentBuilder,
  createTemplatePostProcessor,
  MarkdownEntry,
  NgDocActions,
  renderTemplateString,
  TemplateBuilderOutput,
} from '@ng-doc/builder';
import path from 'path';

import { markdownToHtml } from '../../../helpers';
import { NgDocBuilderContext } from '../../../interfaces';
import { Builder, CacheStrategy, factory } from '../../core';
import { EntryMetadata } from '../interfaces';

interface Config {
  context: NgDocBuilderContext;
  metadata: EntryMetadata<MarkdownEntry>;
  keyword?: string;
}

export const GUIDE_TEMPLATE_BUILDER_TAG = 'GuideTemplate';
export const GUIDE_BUILDER_TAG = 'Guide';

/**
 *
 * @param config
 */
export function guideTemplateBuilder(config: Config): Builder<TemplateBuilderOutput> {
  const { context, metadata, keyword } = config;
  const mdPath = metadata.entry.mdPath;
  const mdDir = path.dirname(mdPath);
  const cacheStrategy = {
    id: `${mdPath}#Template`,
    action: 'skip',
  } satisfies CacheStrategy<undefined, string>;

  return createTemplatePostProcessor(
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
            keyword,
            keywordType: 'guide',
            getContent: async (dependencies) => {
              const mdContent = renderTemplateString(metadata.entry.content, {
                scope: metadata.dir,
                context: {
                  NgDocPage: metadata.parent,
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
    { context, metadata, pageType: 'guide', templatePath: mdPath },
  );
}
