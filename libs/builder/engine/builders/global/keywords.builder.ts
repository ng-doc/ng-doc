import path from 'path';

import { NgDocBuilderContext } from '../../../interfaces';
import { afterBuilders, Builder, FileOutput, keywordsStore, runBuild } from '../../core';
import { PAGE_TEMPLATE_BUILDER_TAG } from '../page/page-template.builder';

/**
 *
 * @param context
 */
export function keywordsBuilder(context: NgDocBuilderContext): Builder<FileOutput> {
  return afterBuilders([PAGE_TEMPLATE_BUILDER_TAG]).pipe(
    runBuild('Keywords', async () => ({
      content: JSON.stringify(Object.fromEntries(keywordsStore)),
      filePath: path.join(context.outAssetsDir, 'keywords.json'),
    })),
  );
}
