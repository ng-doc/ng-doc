import path from 'path';
import { debounceTime, of, switchMap } from 'rxjs';

import { NgDocBuilderContext } from '../../../interfaces';
import { Builder, FileOutput, keywordsStore, runBuild } from '../../core';

/** Publishes the latest complete store snapshot whenever keyword ownership changes. */
export function keywordsBuilder(context: NgDocBuilderContext): Builder<FileOutput> {
  const builder = of(void 0).pipe(
    runBuild('Keywords', async () => ({
      content: JSON.stringify(Object.fromEntries(keywordsStore)),
      filePath: path.join(context.outAssetsDir, 'keywords.json'),
    })),
  );

  // This aggregate has no main trigger to unblock createBuilder's secondary
  // trigger suppression. Observe the actual store, including cache restores,
  // instead of racing the completion of selected rendering builder tags.
  return keywordsStore.changes().pipe(
    debounceTime(0),
    switchMap(() => builder),
  );
}
