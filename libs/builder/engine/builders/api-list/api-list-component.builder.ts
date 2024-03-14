import { renderTemplate } from '@ng-doc/builder';
import { NgDocApi, uid } from '@ng-doc/core';
import { of } from 'rxjs';

import { Builder, FileOutput, runBuild } from '../../core';
import { EntryMetadata } from '../interfaces';

interface Config {
  metadata: EntryMetadata<NgDocApi>;
}

export const API_LIST_COMPONENT_BUILDER_TAG = 'ApiListComponent';

/**
 *
 * @param config
 */
export function apiListComponentBuilder(config: Config): Builder<FileOutput> {
  const { metadata } = config;

  return of(void 0).pipe(
    runBuild(API_LIST_COMPONENT_BUILDER_TAG, async () => ({
      filePath: metadata.outPath,
      content: renderTemplate('./api-list.ts.nunj', {
        context: {
          id: uid(),
          segment: metadata.entry.route,
        },
      }),
    })),
  );
}
