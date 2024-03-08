import path from 'path';
import { of } from 'rxjs';

import { NgDocBuilderContext } from '../../../interfaces';
import {
  Builder,
  createBuilder,
  createSecondaryTrigger,
  FileOutput,
  IndexStore,
  runBuild,
} from '../../core';

/**
 *
 * @param context
 */
export function searchIndexesBuilder(context: NgDocBuilderContext): Builder<FileOutput> {
  const builder = of(void 0).pipe(
    runBuild('SearchIndexes', async () => ({
      content: JSON.stringify(IndexStore.asArray(), null, 2),
      filePath: path.join(context.outAssetsDir, 'indexes.json'),
    })),
  );

  return createBuilder([createSecondaryTrigger(IndexStore.changes())], () => builder, false);
}
