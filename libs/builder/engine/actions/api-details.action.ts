import { renderTemplate } from '@ng-doc/builder';
import { kebabCase } from '@ng-doc/core';

import { NgDocAction } from '../../types';

/**
 *
 * @param declarationPath
 */
export function apiDetailsAction(declarationPath: string): NgDocAction {
  return (entry) => {
    const [sourceFilePath, name] = declarationPath.split('#');
    const project = entry.sourceFile.getProject();

    if (!sourceFilePath || !name) {
      throw new Error(
        `NgDocAction.apiDetails error: Invalid declaration path: ${declarationPath}; expected format: path/to/file.ts#declarationName`,
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
      throw new Error(
        `NgDocAction.apiDetails error: Declaration not found ("${declarationPath}") make sure it's exported`,
      );
    }

    const kindName = kebabCase(declaration.getKindName());

    return {
      output: renderTemplate(`./api/details/${kindName}.html.nunj`, {
        context: {
          declaration,
        },
      }),
      dependencies: [sourceFilePath],
    };
  };
}
