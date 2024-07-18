import {
  CacheStrategy,
  createBuilder,
  createImportPath,
  createMainTrigger,
  getPlaygroundMetadata,
  PAGE_NAME,
  renderTemplate,
  runBuild,
} from '@ng-doc/builder';
import { NgDocPage } from '@ng-doc/core';
import * as path from 'path';
import { of } from 'rxjs';

import { getPlaygroundsClassDeclarations } from '../../../helpers';
import { Builder, FileOutput, watchFile } from '../../core';
import { EntryMetadata } from '../interfaces';

interface Config {
  page: EntryMetadata<NgDocPage>;
}

export const PAGE_PLAYGROUND_BUILDER_TAG = 'PagePlayground';

/**
 *
 * @param config
 */
export function playgroundBuilder(config: Config): Builder<FileOutput> {
  const { page } = config;
  const references = getPlaygroundsClassDeclarations(page.objectExpression()).map(
    (classDeclaration) => classDeclaration.getSourceFile(),
  );
  const outPath = path.join(page.outDir, 'playgrounds.ts');
  const cacheStrategy = {
    id: `${page.path}#Playground`,
    action: 'skip',
    files: () => [page.path, outPath, ...references.map((sourceFile) => sourceFile.getFilePath())],
  } satisfies CacheStrategy<undefined, string>;

  const builder = of(void 0).pipe(
    runBuild(
      PAGE_PLAYGROUND_BUILDER_TAG,
      async () => {
        references.forEach((sourceFile) => {
          sourceFile.refreshFromFileSystemSync();
        });

        const playgroundMetadata = getPlaygroundMetadata(page.entry, page.objectExpression());

        return {
          filePath: outPath,
          content: renderTemplate('./playgrounds.ts.nunj', {
            context: {
              playgroundMetadata,
              hasImports: !!page.objectExpression().getProperty('imports'),
              entryImportPath: createImportPath(page.outDir, path.join(page.dir, PAGE_NAME)),
            },
          }),
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
