import { asArray } from '@ng-doc/core';
import { sync } from 'fast-glob';
import { ExportedDeclarations, Project, SourceFile } from 'ts-morph';

import { NgDocSupportedDeclaration } from '../../types';
import { isPublicDeclaration } from '../is-public-declaration';
import { isSupportedDeclaration } from '../is-supported-declaration';

/**
 *
 * @param path
 * @param project
 * @param paths
 * @param ignore
 */
export function findDeclarations(
  project: Project,
  paths: string[],
  ignore?: string[],
): Map<string, NgDocSupportedDeclaration> {
  const filePaths = asArray(paths)
    .map((i: string) =>
      sync(i, {
        ignore,
        absolute: true,
      }),
    )
    .flat();

  return project
    .addSourceFilesAtPaths(filePaths)
    .map((sourceFile: SourceFile) => Array.from(sourceFile.getExportedDeclarations().values()))
    .flat(2)
    .reduce((acc: Map<string, NgDocSupportedDeclaration>, declaration: ExportedDeclarations) => {
      if (isSupportedDeclaration(declaration) && isPublicDeclaration(declaration)) {
        const filePath = declaration.getSourceFile().getFilePath();
        const name = declaration.getName();

        acc.set(`${filePath}#${name}`, declaration);
      }

      return acc;
    }, new Map());
}
