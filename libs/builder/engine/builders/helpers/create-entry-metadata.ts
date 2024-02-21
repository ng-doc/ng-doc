import { asArray } from '@ng-doc/core';
import path from 'path';
import { SourceFile } from 'ts-morph';

import { getObjectExpressionFromDefault } from '../../../helpers';
import { NgDocBuilderContext } from '../../../interfaces';
import { Entry, EntryMetadata } from '../interfaces';
import { getCategorySourceFile } from './get-category-source-file';
import { getEntryRoute } from './get-entry-route';

/**
 *
 * @param context
 * @param entry
 * @param sourceFile
 */
export function createEntryMetadata<T extends Entry>(
  context: NgDocBuilderContext,
  entry: T,
  sourceFile: SourceFile,
): EntryMetadata<T> {
  const dir = sourceFile.getDirectoryPath();
  const dirName = path.basename(dir);
  const route = getEntryRoute(entry) ?? dirName;
  const entryPath = sourceFile.getFilePath();
  const categorySourceFile = entry.category && getCategorySourceFile(sourceFile);
  const relativePath = path.relative(context.docsPath, dir);
  const outDir = path.join(context.outGuidesDir, relativePath);
  const objectExpression = getObjectExpressionFromDefault(sourceFile);

  if (!objectExpression) {
    throw new Error(
      `No object expression found in ${entryPath}, make sure the file has a default export.`,
    );
  }

  return {
    dir,
    dirName,
    route,
    relativePath,
    outDir,
    sourceFile,
    objectExpression,
    absoluteRoute: function (): string {
      const routePrefix = context.config.routePrefix ? `${context.config.routePrefix}/` : '';
      const parentRoute = this.category?.absoluteRoute() ?? '';
      const parentRoutePrefix = parentRoute ? `${parentRoute}/` : '';

      return `${parentRoutePrefix || routePrefix}${this.route}`;
    },
    breadcrumbs: function (): string[] {
      return asArray(this.category?.breadcrumbs(), this.entry.title);
    },
    category:
      entry.category && categorySourceFile
        ? createEntryMetadata(context, entry.category, categorySourceFile)
        : undefined,
    entry,
  };
}
