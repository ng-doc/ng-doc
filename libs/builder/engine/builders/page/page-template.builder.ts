import { contentBuilder, createTemplatePostProcessor } from '@ng-doc/builder';
import { NgDocPage } from '@ng-doc/core';
import path from 'path';

import { NgDocBuilderContext } from '../../../interfaces';
import { AsyncFileOutput, Builder, CacheStrategy, factory } from '../../core';
import { renderTemplate } from '../../nunjucks';
import { EntryMetadata } from '../interfaces';

interface Config {
  context: NgDocBuilderContext;
  page: EntryMetadata<NgDocPage>;
}

export const PAGE_TEMPLATE_BUILDER_TAG = 'PageTemplate';
export const GUIDE_BUILDER_TAG = 'Guide';

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

  return createTemplatePostProcessor(
    (postProcess) =>
      factory(
        PAGE_TEMPLATE_BUILDER_TAG,
        [
          contentBuilder({
            tag: GUIDE_BUILDER_TAG,
            context,
            mainFilePath: mdPath,
            cacheId: `${mdPath}#Guide`,
            entry: page,
            keyword: page.entry.keyword,
            keywordType: 'guide',
            getContent: (dependencies) =>
              renderTemplate(page.entry.mdFile, {
                scope: page.dir,
                context: {
                  NgDocPage: page,
                  NgDocActions: undefined,
                },
                dependencies,
                filters: false,
              }),
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
    { context, metadata: page, templatePath: mdPath },
  );
}
