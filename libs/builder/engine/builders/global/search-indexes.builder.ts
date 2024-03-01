import path from 'path';
import { merge } from 'rxjs';
import { debounceTime } from 'rxjs/operators';

import { NgDocBuilderContext } from '../../../interfaces';
import {
  Builder,
  FileOutput,
  IndexStore,
  onRemoveFromStore,
  runBuild,
  whenBuildersStackIsEmpty,
} from '../../core';
import { GUIDE_BUILDER_TAG } from '../page/guide.builder';

/**
 *
 * @param context
 */
export function searchIndexesBuilder(context: NgDocBuilderContext): Builder<FileOutput> {
  return merge(whenBuildersStackIsEmpty([GUIDE_BUILDER_TAG]), onRemoveFromStore(IndexStore)).pipe(
    debounceTime(0),
    runBuild('SearchIndexes', async () => ({
      content: JSON.stringify(IndexStore.asArray(), null, 2),
      filePath: path.join(context.outAssetsDir, 'indexes.json'),
    })),
  );
}
