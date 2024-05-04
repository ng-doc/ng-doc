import { of } from 'rxjs';

import { NgDocBuilderContext } from '../../../interfaces';
import { Builder, createBuilder, runBuild } from '../../core';
import { renderTemplate } from '../../nunjucks';
import { EntryMetadata } from '../interfaces';

interface Config {
  context: NgDocBuilderContext;
  metadata: EntryMetadata;
}

/**
 *
 * @param config
 */
export function guideHeaderBuilder(config: Config): Builder<string> {
  const { context, metadata } = config;

  const builder = () => {
    return of(null).pipe(
      runBuild('GuideHeader', async () => {
        const headerTemplatePath = context.config.guide?.headerTemplate;

        return renderTemplate(headerTemplatePath ?? './page-header.html.nunj', {
          scope: headerTemplatePath ? context.context.workspaceRoot : undefined,
          context: {
            page: metadata.entry,
          },
        });
      }),
    );
  };

  return createBuilder([], builder);
}
