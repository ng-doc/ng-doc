import { renderTemplate } from '@ng-doc/builder';
import { kebabCase } from '@ng-doc/core';

import { getApiForDeclaration } from '../../helpers/api/get-api-for-declaration';
import { NgDocAction } from '../../types';

/**
 *
 * @param declarationPath
 */
export function apiAction(declarationPath: string): NgDocAction {
  return (entry) => {
    const [sourceFilePath, name] = declarationPath.split('#');
    const project = entry.sourceFile.getProject();

    if (!sourceFilePath || !name) {
      throw new Error(
        `NgDocAction.api error: Invalid declaration path: ${declarationPath}; expected format: path/to/file.ts#declarationName`,
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
      throw new Error(`NgDocAction.api error: Declaration not found: ${declarationPath}`);
    }

    const api = getApiForDeclaration(declaration);
    const kindName = kebabCase(declaration.getKindName());

    return {
      output: renderTemplate(`./api/${kindName}.html.nunj`, {
        context: {
          api,
        },
      }),
      dependencies: [sourceFilePath],
    };
  };
}
