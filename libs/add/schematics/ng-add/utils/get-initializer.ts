import { ClassDeclaration, Decorator, Expression, Node, ObjectLiteralElementLike } from 'ng-morph';

/**
 *
 * @param classDeclaration
 * @param decoratorName
 * @param propertyName
 */
export function getInitializer(
  classDeclaration: ClassDeclaration,
  decoratorName: string,
  propertyName: string,
): Expression | undefined {
  const decorator: Decorator | undefined = classDeclaration.getDecorator(decoratorName);

  if (!decorator) {
    return;
  }

  const [metadata] = decorator.getArguments();

  if (!Node.isObjectLiteralExpression(metadata)) {
    return;
  }

  const property: ObjectLiteralElementLike | undefined = metadata.getProperty(propertyName);

  if (!Node.isPropertyAssignment(property)) {
    return;
  }

  return property.getInitializer();
}
