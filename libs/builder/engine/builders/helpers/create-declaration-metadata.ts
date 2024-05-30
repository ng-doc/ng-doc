import { asArray, NgDocApi, NgDocApiScope } from '@ng-doc/core';
import path from 'path';
import { Subject } from 'rxjs';

import { declarationFolderName, isSupportedDeclaration } from '../../../helpers';
import { NgDocBuilderContext } from '../../../interfaces';
import { NgDocSupportedDeclaration } from '../../../types';
import { DeclarationEntry, EntryMetadata } from '../interfaces';

/**
 *
 * @param context
 * @param declaration
 * @param entry
 * @param scope
 */
export function createDeclarationMetadata(
  context: NgDocBuilderContext,
  declaration: NgDocSupportedDeclaration,
  entry: EntryMetadata<NgDocApi>,
  scope: NgDocApiScope,
): EntryMetadata<DeclarationEntry> {
  const declarationName = declaration.getName() ?? '[Unknown]';
  const sourceFile = declaration.getSourceFile();
  const dir = sourceFile.getDirectoryPath();
  const dirName = path.basename(dir);
  const route = path.join(
    ...asArray(
      entry.route ?? 'api',
      declarationFolderName(declaration),
      scope.route,
      declaration.getName(),
    ),
  );
  const outDir = path.join(context.outApiDir, route);
  const selfDestroy = new Subject<void>();

  return {
    ...entry,
    dir,
    dirName,
    path: sourceFile.getFilePath(),
    route,
    outDir,
    // Having parent as undefined will force rendering list of routes flat
    parent: undefined,
    outPath: path.join(outDir, 'page.ts'),
    title: declarationName,
    keywordTitle: declarationName,
    sourceFile,
    breadcrumbs: function (): string[] {
      return [entry.title, scope.name, this.title];
    },
    refresh: async function (): Promise<void> {
      await sourceFile.refreshFromFileSystem();

      const newDeclaration = sourceFile.getExportedDeclarations().get(declarationName)?.[0];

      if (!newDeclaration || !isSupportedDeclaration(newDeclaration)) {
        selfDestroy.next();
      } else {
        this.entry.declaration = newDeclaration;
      }
    },
    selfDestroy,
    hidden: true,
    entry: {
      declaration,
      scope,
    },
  };
}
