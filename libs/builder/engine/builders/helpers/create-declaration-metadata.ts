import { asArray, NgDocApi, NgDocApiScope } from '@ng-doc/core';
import path from 'path';

import { declarationFolderName } from '../../../helpers';
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
  scope?: NgDocApiScope,
): EntryMetadata<DeclarationEntry> {
  const dir = declaration.getSourceFile().getDirectoryPath();
  const dirName = path.basename(dir);
  const route = path.join(
    ...asArray(
      entry.route ?? 'api',
      declarationFolderName(declaration),
      scope?.route,
      declaration.getName(),
    ),
  );
  const outDir = path.join(context.outApiDir, route);

  return {
    ...entry,
    dir,
    dirName,
    path: declaration.getSourceFile().getFilePath(),
    route,
    outDir,
    // Having parent as undefined will force rendering list of routes flat
    parent: undefined,
    outPath: path.join(outDir, 'page.ts'),
    title: declaration.getName() ?? '[Unknown]',
    keywordTitle: declaration.getName() ?? '[Unknown]',
    sourceFile: declaration.getSourceFile(),
    breadcrumbs: () => [],
    hidden: true,
    entry: {
      declaration,
    },
  };
}
