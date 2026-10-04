import path from 'path';
import { debounceTime, of, switchMap } from 'rxjs';

import { NgDocBuilderContext } from '../../../interfaces';
import { Builder, FileOutput, keywordsStore, runBuild } from '../../core';

function stableKeywords(): Record<string, unknown> {
  return Object.fromEntries(
    Array.from(keywordsStore).sort(([left], [right]) => left.localeCompare(right)),
  );
}

export function keywordsBuilder(context: NgDocBuilderContext): Builder<FileOutput> {
  const builder = of(void 0).pipe(
    runBuild('Keywords', async () => ({
      content: JSON.stringify(stableKeywords()),
      filePath: path.join(context.outAssetsDir, 'keywords.json'),
    })),
  );

  return keywordsStore.changes().pipe(
    debounceTime(0),
    switchMap(() => builder),
  );
}
