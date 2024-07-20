import { Node } from 'ts-morph';

import { getDeclarationByPath, getJsDocTags, minifyHtml } from '../../../helpers';
import { NgDocAction } from '../../../types';

/**
 *
 * @param declarationPath
 * @param tagName
 */
export function jsDocTagsAction(declarationPath: string, tagName: string): NgDocAction<string[]> {
  return (entry) => {
    const project = entry.sourceFile.getProject();
    const declaration = getDeclarationByPath(project, declarationPath);
    const output = Node.isVariableDeclaration(declaration)
      ? getJsDocTags(declaration.getVariableStatement()!, tagName)
      : getJsDocTags(declaration, tagName);

    return {
      output: output.map(minifyHtml),
      dependencies: [declaration.getSourceFile().getFilePath()],
    };
  };
}
