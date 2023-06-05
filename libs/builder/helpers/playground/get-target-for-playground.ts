import {ClassDeclaration, Expression, Node, ObjectLiteralElementLike, ObjectLiteralExpression} from 'ts-morph';

/**
 *
 * @param expression
 * @param playgroundId
 * @param playground
 */
export function getTargetForPlayground(playground: ObjectLiteralExpression): ClassDeclaration | undefined {
	const target: ObjectLiteralElementLike | undefined = playground.getProperty('target');

	if (Node.isPropertyAssignment(target)) {
		const targetInitializer: Expression | undefined = target.getInitializer();

		if (Node.isIdentifier(targetInitializer)) {
			const declaration: Node | undefined = targetInitializer.getType()?.getSymbol()?.getDeclarations()[0];

			if (Node.isClassDeclaration(declaration)) {
				return declaration;
			}
		}
	}

	return undefined;
}
