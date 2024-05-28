import { Node } from 'ts-morph';

import { getDeclarationByPath, getJsDocDescription } from '../../../helpers';
import { NgDocAction } from '../../../types';

/**
 *
 * @param declarationPath
 */
export function jsDocAction(declarationPath: string): NgDocAction<string> {
  return (entry) => {
    const project = entry.sourceFile.getProject();
    const declaration = getDeclarationByPath(project, declarationPath);

    return {
      output: Node.isVariableDeclaration(declaration)
        ? getJsDocDescription(declaration.getVariableStatement()!)
        : getJsDocDescription(declaration),
      dependencies: [declaration.getSourceFile().getFilePath()],
    };
  };
}
