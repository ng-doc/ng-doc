import { merge, takeUntil } from 'rxjs';

import { NgDocBuilderContext } from '../../../interfaces';
import { AsyncFileOutput, Builder, FileOutput, watchFile, whenDone } from '../../core';
import { demoAssetsBuilder } from './demo-assets.builder';
import { pageFileBuilder } from './page-file.builder';
import { pageTemplateBuilder } from './page-template.builder';
import { playgroundBuilder } from './playground.builder';

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
  return pageFileBuilder({ context, pagePath }).pipe(
    whenDone((page) => {
      return merge(
        pageTemplateBuilder({ context, page }),
        demoAssetsBuilder({ context, page }),
        playgroundBuilder({ page }),
      );
    }),
    takeUntil(watchFile(pagePath)),
  );
}
