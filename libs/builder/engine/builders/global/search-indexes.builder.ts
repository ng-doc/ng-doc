import path from 'path';
import { merge } from 'rxjs';

import { NgDocBuilderContext } from '../../../interfaces';
import {
  afterBuilders,
  Builder,
  FileOutput,
  IndexStore,
  onRemoveFromStore,
  runBuild,
} from '../../core';
import { PAGE_TEMPLATE_BUILDER_TAG } from '../page/page-template.builder';

/**
 *
 * @param context
 */
export function searchIndexesBuilder(context: NgDocBuilderContext): Builder<FileOutput> {
  return merge(afterBuilders([PAGE_TEMPLATE_BUILDER_TAG]), onRemoveFromStore(IndexStore)).pipe(
    runBuild('SearchIndexes', async () => ({
      content: JSON.stringify(IndexStore.asArray(), null, 2),
      filePath: path.join(context.outAssetsDir, 'indexes.json'),
    })),
  );
}
