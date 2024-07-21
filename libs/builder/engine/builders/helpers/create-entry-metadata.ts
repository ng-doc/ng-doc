import { asArray, JSDocMetadata } from '@ng-doc/core';
import { minimatch } from 'minimatch';
import path from 'path';
import { NEVER } from 'rxjs';
import { SourceFile } from 'ts-morph';

import {
  getAllJsDocTags,
  getJsDocDescription,
  getObjectExpressionFromDefault,
} from '../../../helpers';
import { NgDocBuilderContext } from '../../../interfaces';
import { CATEGORY_PATTERN } from '../../variables';
import { EntryMetadata, FileEntry } from '../interfaces';
import { getCategorySourceFile } from './get-category-source-file';
import { getEntryOutDir } from './get-entry-out-dir';
import { getEntryRoute } from './get-entry-route';
import { getVariableStatementFromObjectLiteralExpression } from './get-variable-statement-from-object-literal-expression';

/**
 *
 * @param context
 * @param entry
 * @param sourceFile
 */
export function createEntryMetadata<T extends FileEntry>(
  context: NgDocBuilderContext,
  entry: T,
  sourceFile: SourceFile,
): EntryMetadata<T> {
  const entryPath = sourceFile.getFilePath();
  const dir = sourceFile.getDirectoryPath();
  const dirName = path.basename(dir);
  const route = getEntryRoute(entry, entryPath);
  const categorySourceFile = entry.category && getCategorySourceFile(sourceFile);
  const outDir = getEntryOutDir(context, entry, entryPath);
  const isCategory = minimatch(entryPath, CATEGORY_PATTERN);

  return {
    dir,
    dirName,
    route,
    outDir,
    outPath: path.join(outDir, 'page.ts'),
    sourceFile,
    objectExpression: () => {
      const objectExpression = getObjectExpressionFromDefault(sourceFile);

      if (!objectExpression) {
        throw new Error(
          `No object expression found in ${entryPath}, make sure the file has a default export.`,
        );
      }

      return objectExpression;
    },
    path: entryPath,
    title: entry.title,
    keywordTitle: entry.title,
    order: entry.order,
    nestedRoutes: !isCategory,
    jsDocMetadata: function (): JSDocMetadata {
      const statement = getVariableStatementFromObjectLiteralExpression(this.objectExpression());
      const description = getJsDocDescription(statement);
      const tags = getAllJsDocTags(statement);

      return {
        description,
        tags,
      };
    },
    absoluteRoute: function (): string {
      return path.join(
        ...asArray(this.parent?.absoluteRoute() ?? context.config.routePrefix, this.route),
      );
    },
    breadcrumbs: function (): string[] {
      return asArray(this.parent?.breadcrumbs(), this.entry.title);
    },
    refresh: async function (): Promise<void> {},
    selfDestroy: NEVER,
    // @ts-expect-error - This is a valid assignment
    parent:
      entry.category && categorySourceFile
        ? createEntryMetadata(context, entry.category, categorySourceFile)
        : undefined,
    entry,
  };
}
