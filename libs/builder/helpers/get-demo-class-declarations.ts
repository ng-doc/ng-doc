import {isPresent} from '@ng-doc/core';
import {ClassDeclaration, Expression, Node, ObjectLiteralElementLike, ObjectLiteralExpression} from 'ts-morph';

/**
 *
 * @param objectExpression
 */
export function getDemoClassDeclarations(objectExpression: ObjectLiteralExpression): ClassDeclaration[] {
	const demoProperty: ObjectLiteralElementLike | undefined = objectExpression.getProperty('demo');

	if (demoProperty && (Node.isPropertyAssignment(demoProperty) || Node.isShorthandPropertyAssignment(demoProperty))) {
		const initializer: Expression | undefined = demoProperty.getInitializer();

		if (initializer && initializer instanceof ObjectLiteralExpression) {
			return initializer
				.getProperties()
				.map((property: ObjectLiteralElementLike) => property.getType().getSymbol()?.getValueDeclaration())
				.filter(isPresent)
				.filter(Node.isClassDeclaration);
		}
	}

	return [];
}
