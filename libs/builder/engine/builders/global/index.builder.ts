import path from 'path';
import { of } from 'rxjs';

import { NgDocBuilderContext } from '../../../interfaces';
import { Builder, FileOutput, runBuild } from '../../core';
import { renderTemplate } from '../../nunjucks';

export const INDEX_BUILDER_TAG = 'IndexFile';

/**
 *
 * @param context
 */
export function indexBuilder(context: NgDocBuilderContext): Builder<FileOutput> {
  const outPath = path.join(context.outDir, 'index.ts');

  return of(null).pipe(
    runBuild(INDEX_BUILDER_TAG, async () => {
      return {
        filePath: outPath,
        content: renderTemplate('./index.ts.nunj'),
      };
    }),
  );
}
