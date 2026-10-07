import {
  AsyncFileOutput,
  CacheStrategy,
  createBuilder,
  createMainTrigger,
  keywordsStore,
  NgDocBuilderContext,
  NgDocComponentAsset,
  renderTemplate,
  runBuild,
} from '@ng-doc/builder';
import { NgDocPage } from '@ng-doc/core';
import * as path from 'path';
import { of } from 'rxjs';
import { tap } from 'rxjs/operators';

import { ObservableSet } from '../../../classes/observable-set';
import { getDemoAssets, getDemoClassDeclarations, UTILS } from '../../../helpers';
import { getComponentSourceFiles } from '../../../helpers/angular/get-component-source-files';
import { Builder } from '../../core';
import { onDependenciesChange } from '../../core/triggers/on-dependencies-change';
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
  const resourcePaths = () =>
    Object.values(getDemoClassDeclarations(page.objectExpression())).flatMap(
      getComponentSourceFiles,
    );
  const dependencies = new ObservableSet<string>(resourcePaths());
  const outPath = path.join(page.outDir, 'demo-assets.ts');
  const usedKeywords = new Set<string>();
  const cacheStrategy = {
    id: `${page.path}#DemoAssets`,
    action: 'skip',
    files: () => [page.path, outPath, ...dependencies.asArray()],
  } satisfies CacheStrategy<undefined, string>;

  const builder = of(void 0).pipe(
    tap(() => {
      references.forEach((sourceFile) => {
        sourceFile.refreshFromFileSystemSync();
      });
      dependencies.fill(...resourcePaths());
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
            const processed = await UTILS.processHtml(asset.code, {
              lightTheme: config.context.config.shiki?.themes.light,
              darkTheme: config.context.config.shiki?.themes.dark,
              // Same output as loading every grammar; Shiki 4 takes seconds to load them all.
              grammars: 'used',
            });

            if (processed.error) {
              throw processed.error;
            }

            const postProcessed = await UTILS.postProcessHtml(processed.content);

            if (postProcessed.error) {
              throw postProcessed.error;
            }

            postProcessed.usedKeywords.forEach((keyword) => usedKeywords.add(keyword));

            asset.code = postProcessed.content;
          }
        }

        return async () => {
          for (const [, value] of Object.entries(demoAssets)) {
            for (const asset of value) {
              asset.code = await UTILS.replaceKeywords(asset.code, {
                getKeyword: keywordsStore.get.bind(keywordsStore),
              });
            }
          }

          return {
            filePath: outPath,
            content: renderTemplate('./demo-assets.ts.nunj', { context: { demoAssets } }),
          };
        };
      },
      cacheStrategy,
    ),
  );

  return createBuilder([createMainTrigger(onDependenciesChange(dependencies))], () => builder);
}
