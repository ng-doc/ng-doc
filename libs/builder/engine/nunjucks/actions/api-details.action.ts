import { kebabCase } from '@ng-doc/core';

import { getDeclarationByPath, minifyHtml } from '../../../helpers';
import { renderTemplate } from '../../../index';
import { NgDocAction } from '../../../types';

/**
 *
 * @param declarationPath
 */
export function apiDetailsAction(declarationPath: string): NgDocAction<string> {
  return (entry) => {
    const project = entry.sourceFile.getProject();
    const declaration = getDeclarationByPath(project, declarationPath);
    const kindName = kebabCase(declaration.getKindName());
    const output = renderTemplate(`./api/details/${kindName}.html.nunj`, {
      context: {
        declaration,
      },
    });

    return {
      output: minifyHtml(output),
      dependencies: [declaration.getSourceFile().getFilePath()],
    };
  };
}
