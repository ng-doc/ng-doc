import { NgDocPage } from '@ng-doc/core';

import { NgDocBuilderContext } from '../../../interfaces';
import { renderTemplate } from '../../nunjucks';
import { EntryMetadata } from '../interfaces';

interface Config {
  context: NgDocBuilderContext;
  metadata: EntryMetadata<NgDocPage>;
}

/**
 *
 * @param config
 */
export function renderPageHeader(config: Config): string {
  const { context, metadata } = config;
  const headerTemplatePath = context.config.guide?.headerTemplate;

  return renderTemplate(headerTemplatePath ?? './page-header.html.nunj', {
    scope: headerTemplatePath ? context.context.workspaceRoot : undefined,
    context: {
      NgDocPage: metadata.entry,
      Metadata: metadata.jsDocMetadata(),
    },
  });
}
