import { asArray, NgDocApiScope } from '@ng-doc/core';
import path from 'path';

import { declarationFolderName } from '../../../helpers';
import { NgDocBuilderContext } from '../../../interfaces';
import { NgDocSupportedDeclaration } from '../../../types';
import { EntryMetadata, PageEntry } from '../interfaces';

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
  entry: EntryMetadata<PageEntry>,
  scope?: NgDocApiScope,
): EntryMetadata<PageEntry> {
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
  const outDir = route;

  return {
    dir,
    dirName,
    route,
    outDir,
    sourceFile: declaration.getSourceFile(),
    objectExpression: entry.objectExpression,
    path: entry.path,
    absoluteRoute: entry.absoluteRoute,
    breadcrumbs: () => [],
    entry: entry.entry,
  };
}

// api/ui-kit/classes/ButtonComponent
// components/button/api/ButtonComponent

// libs/ui-kit/components/button-component.ts#ButtonComponent$Api
// libs/ui-kit/components/button-component.ts#ButtonComponent$Guide
