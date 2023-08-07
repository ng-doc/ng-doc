import {isPresent} from '@ng-doc/core';
import {ClassDeclaration, Expression, Node, ObjectLiteralElementLike, ObjectLiteralExpression} from 'ts-morph';

/**
 *
 * @param objectExpression
 */
export function getDemoClassDeclarations(objectExpression: ObjectLiteralExpression): Record<string, ClassDeclaration> {
	const demoProperty: ObjectLiteralElementLike | undefined = objectExpression.getProperty('demos');

	if (demoProperty && (Node.isPropertyAssignment(demoProperty) || Node.isShorthandPropertyAssignment(demoProperty))) {
		const initializer: Expression | undefined = demoProperty.getInitializer();

		if (Node.isObjectLiteralExpression(initializer)) {
			return initializer.getProperties().reduce((acc: Record<string, ClassDeclaration>, property) => {
				const classDeclaration = property.getType().getSymbol()?.getValueDeclaration();

				if (Node.isClassDeclaration(classDeclaration)) {
					if (Node.isShorthandPropertyAssignment(property) && classDeclaration.getName()) {
						const className = classDeclaration.getName();

						if (isPresent(className)) {
							acc[className] = classDeclaration;
						}
					} else if (Node.isPropertyAssignment(property)) {
						acc[property.getName()] = classDeclaration;
					}
				}

				return acc;
			}, {});
		}
	}

	return {};
}
