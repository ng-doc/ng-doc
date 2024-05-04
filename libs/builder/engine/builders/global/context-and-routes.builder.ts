import path from 'path';
import { merge, of } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import { NgDocBuilderContext } from '../../../interfaces';
import {
  Builder,
  createBuilder,
  createMainTrigger,
  FileOutput,
  PageStore,
  runBuild,
} from '../../core';
import { renderTemplate } from '../../nunjucks';
import { getStructuredDocs, StructuredDoc } from '../helpers';

/**
 *
 * @param context
 */
export function contextAndRoutesBuilder(context: NgDocBuilderContext): Builder<FileOutput> {
  const builder = of(void 0).pipe(
    switchMap(() => {
      const structuredDocs = getStructuredDocs(PageStore.asArray());

      return merge(contextBuilder(context, structuredDocs), routesBuilder(context, structuredDocs));
    }),
  );

  return createBuilder([createMainTrigger(PageStore.changes())], () => builder, false);
}

export const ROUTES_BUILDER_TAG = 'Routes';

/**
 *
 * @param context
 * @param structuredDocs
 */
function routesBuilder(
  context: NgDocBuilderContext,
  structuredDocs: StructuredDoc[],
): Builder<FileOutput> {
  const outPath = path.join(context.outDir, 'routes.ts');

  return of(null).pipe(
    runBuild(ROUTES_BUILDER_TAG, async () => {
      return {
        filePath: outPath,
        content: renderTemplate('./routes.ts.nunj', {
          context: {
            entries: structuredDocs,
            curDir: context.outDir,
          },
        }),
      };
    }),
  );
}

export const CONTEXT_BUILDER_TAG = 'Context';

/**
 *
 * @param context
 * @param structuredDocs
 */
function contextBuilder(
  context: NgDocBuilderContext,
  structuredDocs: StructuredDoc[],
): Builder<FileOutput> {
  const outPath = path.join(context.outDir, 'context.ts');

  return of(null).pipe(
    runBuild(CONTEXT_BUILDER_TAG, async () => {
      return {
        filePath: outPath,
        content: renderTemplate('./context.ts.nunj', {
          context: {
            entries: structuredDocs,
            routePrefix: context.config.routePrefix,
          },
        }),
      };
    }),
  );
}
