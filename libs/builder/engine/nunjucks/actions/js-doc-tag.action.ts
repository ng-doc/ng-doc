import { Node } from 'ts-morph';

import { getDeclarationByPath, getJsDocTag } from '../../../helpers';
import { NgDocAction } from '../../../types';

/**
 *
 * @param declarationPath
 * @param tagName
 */
export function jsDocTagAction(declarationPath: string, tagName: string): NgDocAction<string> {
  return (entry) => {
    const project = entry.sourceFile.getProject();
    const declaration = getDeclarationByPath(project, declarationPath);

    return {
      output: Node.isVariableDeclaration(declaration)
        ? getJsDocTag(declaration.getVariableStatement()!, tagName)
        : getJsDocTag(declaration, tagName),
      dependencies: [declaration.getSourceFile().getFilePath()],
    };
  };
}
