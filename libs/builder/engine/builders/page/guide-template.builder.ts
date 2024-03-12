import { contentBuilder, createTemplatePostProcessor } from '@ng-doc/builder';
import { NgDocPage } from '@ng-doc/core';
import path from 'path';

import { markdownToHtml } from '../../../helpers';
import { NgDocBuilderContext } from '../../../interfaces';
import { AsyncFileOutput, Builder, CacheStrategy, factory } from '../../core';
import { renderTemplate } from '../../nunjucks';
import { EntryMetadata } from '../interfaces';

interface Config {
  context: NgDocBuilderContext;
  page: EntryMetadata<NgDocPage>;
}

export const GUIDE_TEMPLATE_BUILDER_TAG = 'GuideTemplate';
export const GUIDE_BUILDER_TAG = 'Guide';

/**
 *
 * @param config
 */
export function guideTemplateBuilder(config: Config): Builder<AsyncFileOutput> {
  const { context, page } = config;
  const mdPath = path.join(page.dir, page.entry.mdFile);
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
            entry: page,
            keyword: page.entry.keyword,
            keywordType: 'guide',
            getContent: async (dependencies) => {
              const mdContent = renderTemplate(page.entry.mdFile, {
                scope: page.dir,
                context: {
                  NgDocPage: page,
                  NgDocActions: undefined,
                },
                dependencies,
                filters: false,
              });

              return markdownToHtml(mdContent, mdDir, dependencies.add.bind(dependencies));
            },
          }),
        ],
        (guide: string) => {
          const html = renderTemplate('./page-template.nunj', {
            context: {
              tabs: [
                { title: 'Guide', content: guide },
                { title: 'API', content: '' },
              ],
            },
          });

          return postProcess(html);
        },
        cacheStrategy,
      ),
    { context, metadata: page, pageType: 'guide', templatePath: mdPath },
  );
}
