import { Expression, Node, ObjectLiteralElementLike, ObjectLiteralExpression } from 'ts-morph';

/**
 *
 * @param expression
 * @param playgroundId
 */
export function getPlaygroundById(
	expression: ObjectLiteralExpression,
	playgroundId: string,
): ObjectLiteralExpression | undefined {
	const playgroundExpression: ObjectLiteralElementLike | undefined =
		expression.getProperty(playgroundId);

	if (Node.isPropertyAssignment(playgroundExpression)) {
		const playgroundInitializer: Expression | undefined = playgroundExpression.getInitializer();

		if (Node.isObjectLiteralExpression(playgroundInitializer)) {
			return playgroundInitializer;
		}
	}

	return undefined;
}
