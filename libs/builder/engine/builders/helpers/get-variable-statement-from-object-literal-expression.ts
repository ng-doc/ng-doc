import { Node, ObjectLiteralExpression, VariableStatement } from 'ts-morph';

/**
 *
 * @param objectLiteral
 */
export function getVariableStatementFromObjectLiteralExpression(
  objectLiteral: ObjectLiteralExpression,
): VariableStatement {
  const parent = objectLiteral.getParent();

  if (Node.isVariableDeclaration(parent)) {
    const statement = parent.getVariableStatement();

    if (statement) {
      return statement;
    }
  }

  throw new Error(
    `Expected the object literal expression to be a child of a variable declaration, but it was not.`,
  );
}
