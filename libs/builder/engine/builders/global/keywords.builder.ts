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
import { PAGE_TEMPLATE_BUILDER_TAG } from '../page/page-template.builder';

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
    [createSecondaryTrigger(afterBuilders([PAGE_TEMPLATE_BUILDER_TAG]))],
    () => builder,
    false,
  );
}
