import { Node } from 'ts-morph';

import { getDeclarationByPath, hasJsDocTag } from '../../../helpers';
import { NgDocAction } from '../../../types';

/**
 *
 * @param declarationPath
 * @param tagName
 */
export function jsDocHasTagAction(declarationPath: string, tagName: string): NgDocAction<boolean> {
  return (entry) => {
    const project = entry.sourceFile.getProject();
    const declaration = getDeclarationByPath(project, declarationPath);

    return {
      output: Node.isVariableDeclaration(declaration)
        ? hasJsDocTag(declaration.getVariableStatement()!, tagName)
        : hasJsDocTag(declaration, tagName),
      dependencies: [declaration.getSourceFile().getFilePath()],
    };
  };
}
