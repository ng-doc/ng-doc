import { kebabCase } from '@ng-doc/core';
import { Node } from 'ts-morph';

import { getDeclarationByPath, minifyHtml } from '../../../helpers';
import { renderTemplate } from '../../../index';
import { NgDocAction } from '../../../types';

/**
 *
 * @param declarationPath
 */
export function apiAction(declarationPath: string): NgDocAction<string> {
  return (entry) => {
    const project = entry.sourceFile.getProject();
    const declaration = getDeclarationByPath(project, declarationPath);
    const kindName = kebabCase(declaration.getKindName());
    const output = renderTemplate(`./api/${kindName}.html.nunj`, {
      context: {
        declaration,
        docNode: Node.isVariableDeclaration(declaration)
          ? declaration.getVariableStatement()
          : declaration,
        hideDescription: true,
        hideSeeAlso: true,
        hideUsageNotes: true,
      },
    });

    return {
      output: minifyHtml(output),
      dependencies: [declaration.getSourceFile().getFilePath()],
    };
  };
}
