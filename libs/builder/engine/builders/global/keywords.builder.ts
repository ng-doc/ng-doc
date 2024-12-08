import path from 'path';
import { of } from 'rxjs';

import { NgDocBuilderContext } from '../../../interfaces';
import {
  afterBuilders,
  Builder,
  createBuilder,
  createSecondaryTrigger,
  FileOutput,
  keywordsStore,
  runBuild,
} from '../../core';
import { API_PAGE_TEMPLATE_BUILDER_TAG } from '../api-list/api-page-template.builder';
import { GUIDE_TEMPLATE_BUILDER_TAG } from '../page/guide-template.builder';

/**
 *
 * @param context
 */
export function keywordsBuilder(context: NgDocBuilderContext): Builder<FileOutput> {
  const builder = of(void 0).pipe(
    runBuild('Keywords', async () => ({
      content: JSON.stringify(Object.fromEntries(keywordsStore)),
      filePath: path.join(context.outAssetsDir, 'keywords.json'),
    })),
  );

  return createBuilder(
    [
      createSecondaryTrigger(
        afterBuilders([GUIDE_TEMPLATE_BUILDER_TAG, API_PAGE_TEMPLATE_BUILDER_TAG]),
      ),
    ],
    () => builder,
  );
}
