import path from 'path';

import { NgDocBuilderContext } from '../../../interfaces';
import { Builder, FileOutput, runBuild, whenBuildersStackIsEmpty } from '../../core';
import { IndexStore } from '../../stores';
import { GUIDE_BUILDER_TAG } from '../page/guide.builder';

/**
 *
 * @param context
 */
export function searchIndexesBuilder(context: NgDocBuilderContext): Builder<FileOutput> {
  return whenBuildersStackIsEmpty([GUIDE_BUILDER_TAG]).pipe(
    runBuild('SearchIndexes', async () => ({
      content: JSON.stringify(IndexStore.asArray(), null, 2),
      filePath: path.join(context.outAssetsDir, 'indexes.json'),
    })),
  );
}
