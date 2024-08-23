import { NgDocSupportedDeclaration } from '@ng-doc/builder';
import { Project } from 'ts-morph';

import { isSupportedDeclaration } from './is-supported-declaration';

/**
 *
 * @param project
 * @param declarationPath
 */
export function getDeclarationByPath(
  project: Project,
  declarationPath: string,
): NgDocSupportedDeclaration {
  const [sourceFilePath, name] = declarationPath.split('#');

  if (!sourceFilePath || !name) {
    throw new Error(
      `Invalid declaration path: ${declarationPath}; expected format: path/to/file.ts#declarationName`,
    );
  }

  let sourceFile = project.getSourceFile(sourceFilePath);

  sourceFile?.refreshFromFileSystemSync();

  if (!sourceFile) {
    sourceFile = project.addSourceFileAtPath(sourceFilePath);
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
