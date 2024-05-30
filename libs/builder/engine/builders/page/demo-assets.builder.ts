import {
  AsyncFileOutput,
  CacheStrategy,
  createBuilder,
  createMainTrigger,
  NgDocBuilderContext,
  NgDocComponentAsset,
  postProcessHtml,
  processHtml,
  renderTemplate,
  replaceKeywords,
  runBuild,
} from '@ng-doc/builder';
import { NgDocPage } from '@ng-doc/core';
import * as path from 'path';
import { of } from 'rxjs';
import { tap } from 'rxjs/operators';

import { getDemoAssets, getDemoClassDeclarations } from '../../../helpers';
import { Builder, watchFile } from '../../core';
import { EntryMetadata } from '../interfaces';

/**
 * Options for the demoAssetsBuilder function.
 */
interface Config {
  context: NgDocBuilderContext;
  page: EntryMetadata<NgDocPage>;
}

export const PAGE_DEMO_ASSETS_BUILDER_TAG = 'PageDemoAssets';

/**
 * Builds demo assets for a given context, object expression, and output directory.
 * @param {Options} options - The options for the builder.
 * @param config
 * @returns {Builder<AsyncFileOutput>} A builder that outputs file outputs.
 */
export function demoAssetsBuilder(config: Config): Builder<AsyncFileOutput> {
  const { context, page } = config;
  const references = Object.values(getDemoClassDeclarations(page.objectExpression())).map(
    (classDeclaration) => classDeclaration.getSourceFile(),
  );
  const usedKeywords = new Set<string>();
  const cacheStrategy = {
    id: `${page.path}#DemoAssets`,
    action: 'skip',
    files: () => [page.path, ...references.map((sourceFile) => sourceFile.getFilePath())],
  } satisfies CacheStrategy<undefined, string>;

  const builder = of(void 0).pipe(
    tap(() => {
      references.forEach((sourceFile) => {
        sourceFile.refreshFromFileSystemSync();
      });
    }),
    runBuild(
      PAGE_DEMO_ASSETS_BUILDER_TAG,
      async () => {
        usedKeywords.clear();

        const classDeclarations = getDemoClassDeclarations(page.objectExpression());

        const demoAssets: NgDocComponentAsset = Object.keys(classDeclarations).reduce(
          (acc: NgDocComponentAsset, key: string) =>
            Object.assign(acc, {
              [key]: getDemoAssets(classDeclarations[key], context.inlineStyleLanguage),
            }),
          {},
        );

        for (const [, value] of Object.entries(demoAssets)) {
          for (const asset of value) {
            asset.code = await processHtml(asset.code, {
              addAnchor: () => {},
            });
            asset.code = await postProcessHtml(asset.code, {
              addUsedKeyword: usedKeywords.add.bind(usedKeywords),
            });
          }
        }

        return async () => {
          for (const [, value] of Object.entries(demoAssets)) {
            for (const asset of value) {
              asset.code = await replaceKeywords(asset.code);
            }
          }

          return {
            filePath: path.join(page.outDir, 'demo-assets.ts'),
            content: renderTemplate('./demo-assets.ts.nunj', { context: { demoAssets } }),
          };
        };
      },
      cacheStrategy,
    ),
  );

  return createBuilder(
    [
      createMainTrigger(
        ...references.map((sourceFile) => watchFile(sourceFile.getFilePath(), 'update')),
      ),
    ],
    () => builder,
  );
}
