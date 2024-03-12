import { NgDocPage } from '@ng-doc/core';
import { merge, takeUntil } from 'rxjs';

import { NgDocBuilderContext } from '../../../interfaces';
import { AsyncFileOutput, Builder, FileOutput, watchFile, whenDone } from '../../core';
import { entryBuilder } from '../shared';
import { demoAssetsBuilder } from './demo-assets.builder';
import { guideTemplateBuilder } from './guide-template.builder';
import { playgroundBuilder } from './playground.builder';

export const PAGE_ENTRY_BUILDER_TAG = 'PageFile';

/**
 *
 * @param context
 * @param path
 * @param pagePath
 */
export function pageBuilder(
  context: NgDocBuilderContext,
  pagePath: string,
): Builder<AsyncFileOutput | FileOutput> {
  return entryBuilder<NgDocPage>({
    tag: PAGE_ENTRY_BUILDER_TAG,
    context,
    entryPath: pagePath,
  }).pipe(
    whenDone((page) => {
      return merge(
        guideTemplateBuilder({ context, page }),
        demoAssetsBuilder({ context, page }),
        playgroundBuilder({ page }),
      );
    }),
    takeUntil(watchFile(pagePath)),
  );
}
