import { NgDocSupportedDeclaration } from '@ng-doc/builder';
import * as path from 'path';
import { Project, SourceFile } from 'ts-morph';

import { EntryMetadata } from '../engine/builders/interfaces/entry-metadata';
import { isSupportedDeclaration } from './is-supported-declaration';

/**
 *
 * @param entry
 * @param sourceFilePath
 * @returns Array of potential path for the sourceFilePath.
 */
function getSearchPaths(entry: EntryMetadata, sourceFilePath: string): string[] {
  const project = entry.sourceFile.getProject();
  const compilerOptions = project.getCompilerOptions();
  return [
    compilerOptions.rootDir ? path.resolve(compilerOptions.rootDir, sourceFilePath) : undefined,
    path.resolve(entry.dir, sourceFilePath),
    sourceFilePath,
  ].filter((p) => p != null);
}

/**
 *
 * @param project
 * @param searchPaths Array of path to search in order
 * @returns SourceFile of first path found or undefined
 */
function getFirstSourceFile(project: Project, searchPaths: string[]): SourceFile | undefined {
  for (const searchPath of searchPaths) {
    const sourceFile = project.getSourceFile(searchPath);
    if (sourceFile) return sourceFile;
  }
  return undefined;
}

/**
 *
 * @param entry
 * @param declarationPath
 */
export function getDeclarationByPath(
  entry: EntryMetadata,
  declarationPath: string,
): NgDocSupportedDeclaration {
  const [sourceFilePath, name] = declarationPath.split('#');

  if (!sourceFilePath || !name) {
    throw new Error(
      `Invalid declaration path: ${declarationPath}; expected format: path/to/file.ts#declarationName`,
    );
  }

  const project = entry.sourceFile.getProject();

  const searchPaths = getSearchPaths(entry, sourceFilePath);
  let sourceFile = getFirstSourceFile(project, searchPaths);

  sourceFile?.refreshFromFileSystemSync();

  if (!sourceFile) {
    sourceFile = project.addSourceFileAtPath(searchPaths[0]);
  }

  const declarationNodes = sourceFile.getExportedDeclarations().get(name);
  const declaration = declarationNodes?.[0];

  if (!declarationNodes || !declaration) {
    throw new Error(`Declaration not found ("${declarationPath}") make sure it's exported`);
  }

  if (!isSupportedDeclaration(declaration)) {
    throw new Error(`Unsupported declaration type ("${declarationPath}")`);
  }

  return declaration;
}
