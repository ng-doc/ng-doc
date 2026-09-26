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
    const declaration = getDeclarationByPath(entry, declarationPath);

    return {
      output: Node.isVariableDeclaration(declaration)
        ? getJsDocTag(declaration.getVariableStatement()!, tagName)
        : getJsDocTag(declaration, tagName),
      dependencies: [declaration.getSourceFile().getFilePath()],
    };
  };
}
