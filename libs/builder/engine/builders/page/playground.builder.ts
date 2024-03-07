import {
  CacheStrategy,
  createImportPath,
  NgDocPlaygroundMetadata,
  PAGE_NAME,
  renderTemplate,
  runBuild,
} from '@ng-doc/builder';
import { NgDocPage, NgDocPlaygroundControlConfig, NgDocPlaygroundProperties } from '@ng-doc/core';
import * as path from 'path';
import { merge } from 'rxjs';
import { startWith } from 'rxjs/operators';
import { ObjectLiteralExpression } from 'ts-morph';

import {
  buildPlaygroundMetadata,
  getDemoClassDeclarations,
  getPlaygroundById,
  getPlaygroundsExpression,
  getPlaygroundsIds,
} from '../../../helpers';
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
  const references = Object.values(getDemoClassDeclarations(page.objectExpression)).map(
    (classDeclaration) => classDeclaration.getSourceFile(),
  );
  const outPath = path.join(page.outDir, 'playgrounds.ts');
  const cacheStrategy = {
    id: `${page.path}#Playground`,
    action: 'skip',
    files: () => [page.path, ...references.map((sourceFile) => sourceFile.getFilePath())],
  } satisfies CacheStrategy<undefined, string>;

  return merge(
    ...references.map((sourceFile) => watchFile(sourceFile.getFilePath(), 'update')),
  ).pipe(
    startWith(void 0),
    runBuild(
      PAGE_PLAYGROUND_BUILDER_TAG,
      async () => {
        references.forEach((sourceFile) => {
          sourceFile.refreshFromFileSystemSync();
        });

        const metadata = getMetadata(page.entry, page.objectExpression);

        return {
          filePath: outPath,
          content: renderTemplate('./playgrounds.ts.nunj', {
            context: {
              playgroundMetadata: metadata,
              hasImports: !!page.objectExpression?.getProperty('imports'),
              entryImportPath: createImportPath(page.outDir, path.join(page.dir, PAGE_NAME)),
            },
          }),
        };
      },
      cacheStrategy,
    ),
  );
}

/**
 *
 * @param page
 * @param objectExpression
 */
function getMetadata(
  page: NgDocPage,
  objectExpression: ObjectLiteralExpression,
): Record<string, NgDocPlaygroundMetadata> {
  const expression = getPlaygroundsExpression(objectExpression);

  if (expression) {
    return getPlaygroundsIds(expression).reduce(
      (metadata: Record<string, NgDocPlaygroundMetadata>, id: string) => {
        if (expression) {
          const playground: ObjectLiteralExpression | undefined = getPlaygroundById(expression, id);

          if (playground) {
            metadata[id] = buildPlaygroundMetadata(
              id,
              playground,
              controlsToProperties(page.playgrounds?.[id]?.controls ?? {}),
            );
          }
        }
        return metadata;
      },
      {},
    );
  }

  return {};
}

/**
 *
 * @param controls
 */
function controlsToProperties(
  controls: Record<string, string | NgDocPlaygroundControlConfig>,
): NgDocPlaygroundProperties {
  return Object.entries(controls).reduce(
    (
      properties: NgDocPlaygroundProperties,
      [name, value]: [string, string | NgDocPlaygroundControlConfig],
    ) => {
      properties[name] = {
        inputName: typeof value === 'string' ? name : value.alias ?? name,
        type: typeof value === 'string' ? value : value.type,
        description: typeof value === 'string' ? undefined : value.description ?? undefined,
        options: typeof value === 'string' ? undefined : value.options ?? undefined,
      };

      return properties;
    },
    {},
  );
}
