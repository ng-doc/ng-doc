import { createImportPath } from '@ng-doc/builder';
import { uid } from '@ng-doc/core';

import { AsyncFileOutput, Builder, CacheStrategy, FileOutput, mergeFactory } from '../../core';
import { renderTemplate } from '../../nunjucks';
import { EntryMetadata, FileEntry, TemplateBuilderOutput } from '../interfaces';

interface Config {
  tag: string;
  metadata: EntryMetadata<FileEntry>;
  pageTemplateBuilders: Array<Builder<TemplateBuilderOutput>>;
}

/**
 *
 * @param config
 */
export function pageWrapperBuilder(config: Config): Builder<AsyncFileOutput | FileOutput> {
  const { tag, metadata, pageTemplateBuilders } = config;
  const cacheStrategy = {
    id: `${metadata.path}#PageWrapper`,
    action: 'skip',
  } satisfies CacheStrategy<undefined, string>;

  return mergeFactory(
    tag,
    pageTemplateBuilders,
    async (...templates) => {
      return {
        filePath: metadata.outPath,
        content: renderTemplate('./page-wrapper.ts.nunj', {
          context: {
            id: uid(),
            metadata,
            entries: getPageWrapperPages(metadata, templates),
          },
        }),
      } satisfies FileOutput;
    },
    cacheStrategy,
    ({ output }) => output,
  );
}

/**
 *
 * @param pageMetadata
 * @param templates
 */
function getPageWrapperPages(
  pageMetadata: EntryMetadata<FileEntry>,
  templates: TemplateBuilderOutput[],
) {
  return templates.reduce(
    (pages, { metadata }) => ({
      ...pages,
      [createImportPath(pageMetadata.outDir, metadata.outPath)]: {
        ...metadata,
      },
    }),
    {},
  );
}
