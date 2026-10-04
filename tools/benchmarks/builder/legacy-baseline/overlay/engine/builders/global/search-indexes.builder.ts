import path from 'path';
import { of, switchMap } from 'rxjs';
import { debounceTime } from 'rxjs/operators';

import { NgDocBuilderContext } from '../../../interfaces';
import { Builder, FileOutput, IndexStore, runBuild } from '../../core';

function stableIndexes(): unknown[] {
  return IndexStore.asArray()
    .slice()
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

export function searchIndexesBuilder(context: NgDocBuilderContext): Builder<FileOutput> {
  const builder = of(void 0).pipe(
    runBuild('SearchIndexes', async () => ({
      content: JSON.stringify(stableIndexes()),
      filePath: path.join(context.outAssetsDir, 'indexes.json'),
    })),
  );

  return IndexStore.changes().pipe(
    debounceTime(50),
    switchMap(() => builder),
  );
}
