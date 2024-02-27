import { NgDocPage } from '@ng-doc/core';
import path from 'path';

import { NgDocBuilderContext } from '../../../interfaces';
import { Builder, factory } from '../../core';
import { renderTemplate } from '../../nunjucks';
import { EntryMetadata } from '../interfaces';
import { apiBuilder } from './api.builder';
import { guideBuilder } from './guide.builder';

interface Config {
  context: NgDocBuilderContext;
  page: EntryMetadata<NgDocPage>;
}

export const PAGE_TEMPLATE_BUILDER_TAG = 'PageComponent';

/**
 *
 * @param root0
 * @param root0.context
 * @param root0.page
 */
export function pageTemplateBuilder({ context, page }: Config): Builder<string> {
  const mdPath = path.join(page.dir, page.entry.mdFile);

  return factory(
    PAGE_TEMPLATE_BUILDER_TAG,
    [guideBuilder({ context, mdPath, page }), apiBuilder(context, page)],
    (guide: string, api: string) =>
      renderTemplate('./page-template.nunj', {
        context: {
          tabs: [
            { title: 'Guide', content: guide },
            { title: 'API', content: api },
          ],
        },
      }),
  );
}
