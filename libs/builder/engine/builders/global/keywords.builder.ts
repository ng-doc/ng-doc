import path from 'path';
import { merge } from 'rxjs';
import { debounceTime } from 'rxjs/operators';

import { NgDocBuilderContext } from '../../../interfaces';
import {
  Builder,
  FileOutput,
  keywordsStore,
  onRemoveFromStore,
  runBuild,
  whenBuildersStackIsEmpty,
} from '../../core';
import { GUIDE_BUILDER_TAG } from '../page/guide.builder';

/**
 *
 * @param context
 */
export function keywordsBuilder(context: NgDocBuilderContext): Builder<FileOutput> {
  return merge(
    whenBuildersStackIsEmpty([GUIDE_BUILDER_TAG]),
    onRemoveFromStore(keywordsStore),
  ).pipe(
    debounceTime(0),
    runBuild('Keywords', async () => ({
      content: JSON.stringify(Object.fromEntries(keywordsStore)),
      filePath: path.join(context.outAssetsDir, 'keywords.json'),
    })),
  );
}
