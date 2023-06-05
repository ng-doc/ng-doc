import {Expression, Node, ObjectLiteralElementLike, ObjectLiteralExpression} from 'ts-morph';

/**
 * Returns the playgrounds expression
 *
 * @param objectLiteralExpression - The object literal expression of the page
 */
export function getPlaygroundsExpression(
	objectLiteralExpression: ObjectLiteralExpression,
): ObjectLiteralExpression | undefined {
	if (objectLiteralExpression) {
		const property: ObjectLiteralElementLike | undefined = objectLiteralExpression.getProperty('playgrounds');

		if (Node.isPropertyAssignment(property)) {
			const value: Expression | undefined = property.getInitializer();

			if (Node.isObjectLiteralExpression(value)) {
				return value;
			}
		}
	}

	return undefined;
}
