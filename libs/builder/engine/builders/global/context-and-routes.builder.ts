import path from 'path';
import { of } from 'rxjs';
import { debounceTime } from 'rxjs/operators';

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
import { getStructuredDocs } from '../helpers';

// doesnt navigate to
///http://localhost:4200/docs/api/classes/ui-kit/NgDocButtonComponent
export const ROUTES_BUILDER_TAG = 'Routes';

/**
 *
 * @param context
 * @param structuredDocs
 */
export function routesBuilder(context: NgDocBuilderContext): Builder<FileOutput> {
  const outPath = path.join(context.outDir, 'routes.ts');

  const builder = of(null).pipe(
    runBuild(ROUTES_BUILDER_TAG, async () => {
      const structuredDocs = getStructuredDocs(PageStore.asArray());

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

  return createBuilder(
    [createMainTrigger(PageStore.changes().pipe(debounceTime(200)))],
    () => builder,
    false,
  );
}

export const CONTEXT_BUILDER_TAG = 'Context';

/**
 *
 * @param context
 * @param structuredDocs
 */
export function contextBuilder(context: NgDocBuilderContext): Builder<FileOutput> {
  const outPath = path.join(context.outDir, 'context.ts');

  const builder = of(null).pipe(
    runBuild(CONTEXT_BUILDER_TAG, async () => {
      const structuredDocs = getStructuredDocs(PageStore.asArray());

      return {
        filePath: outPath,
        content: renderTemplate('./context.ts.nunj', {
          context: {
            entries: structuredDocs,
            routePrefix: context.config.routePrefix,
            shikiThemeLight: context.config.shiki?.themes.light,
            shikiThemeDark: context.config.shiki?.themes.dark,
          },
        }),
      };
    }),
  );

  return createBuilder(
    [createMainTrigger(PageStore.changes().pipe(debounceTime(200)))],
    () => builder,
    false,
  );
}
