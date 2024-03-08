import { NgDocPage } from '@ng-doc/core';
import path from 'path';
import { of } from 'rxjs';

import { NgDocBuilderContext } from '../../../interfaces';
import { Builder, createBuilder, createMainTrigger, runBuild, watchFile } from '../../core';
import { EntryMetadata } from '../interfaces';

export const PAGE_API_BUILDER_TAG = 'PageApi';

/**
 *
 * @param context
 * @param dir
 * @param page
 */
export function apiBuilder(
  context: NgDocBuilderContext,
  page: EntryMetadata<NgDocPage>,
): Builder<string> {
  const mdPath = path.join(page.dir, page.entry.mdFile);

  const builder = of(void 0).pipe(
    triggersController(PAGE_API_BUILDER_TAG),
    runBuild(PAGE_API_BUILDER_TAG, async () => {
      return '';
    }),
  );

  return createBuilder([createMainTrigger(watchFile(mdPath, 'update'))], () => builder);
}
