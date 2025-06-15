import { Node, ObjectLiteralExpression, PropertyAssignment } from 'ts-morph';

/**
 *
 * @param expression
 */
export function getPlaygroundsIds(expression: ObjectLiteralExpression): string[] {
  return (
    expression
      .getProperties()
      .filter(Node.isPropertyAssignment)
      .map((p: PropertyAssignment) => p.getName()) ?? []
  );
}
