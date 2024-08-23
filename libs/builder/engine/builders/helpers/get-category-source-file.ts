import { Node, SourceFile } from 'ts-morph';

import { getObjectExpressionFromDefault } from '../../../helpers';

/**
 * Retrieves the source file for a given category.
 * @param {SourceFile} sourceFile - The source file to retrieve the category from.
 * @returns {SourceFile | undefined} The source file for the category, or undefined if it could not be found.
 */
export function getCategorySourceFile(sourceFile: SourceFile): SourceFile | undefined {
  const objectExpression = getObjectExpressionFromDefault(sourceFile);

  if (objectExpression) {
    const categoryProperty = objectExpression.getProperty('category');

    if (Node.isPropertyAssignment(categoryProperty)) {
      const initializer = categoryProperty.getInitializer();

      if (initializer) {
        const categorySourceFile = initializer
          .getSymbol()
          ?.getAliasedSymbol()
          ?.getValueDeclaration()
          ?.getSourceFile();

        if (categorySourceFile) {
          return categorySourceFile;
        }
      }
    }
  }

  return undefined;
}
