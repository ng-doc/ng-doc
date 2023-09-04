import { Expression, Node, ObjectLiteralElementLike, ObjectLiteralExpression } from 'ts-morph';

/**
 *
 * @param expression
 * @param playgroundId
 * @param playground
 */
export function getContentForPlayground(
	playground: ObjectLiteralExpression,
): Record<string, string> {
	const content: ObjectLiteralElementLike | undefined = playground.getProperty('content');

	if (Node.isPropertyAssignment(content)) {
		const contentInitializer: Expression | undefined = content.getInitializer();

		if (Node.isObjectLiteralExpression(contentInitializer)) {
			return contentInitializer
				.getProperties()
				.reduce((content: Record<string, string>, property: ObjectLiteralElementLike) => {
					if (Node.isPropertyAssignment(property)) {
						const initializer: Expression | undefined = property.getInitializer();

						if (Node.isObjectLiteralExpression(initializer)) {
							const templateProperty: ObjectLiteralElementLike | undefined =
								initializer.getProperty('template');

							if (Node.isPropertyAssignment(templateProperty)) {
								const templateInitializer: Expression | undefined =
									templateProperty.getInitializer();

								if (
									Node.isStringLiteral(templateInitializer) ||
									Node.isNoSubstitutionTemplateLiteral(templateInitializer)
								) {
									content[property.getName()] = templateInitializer.getLiteralValue();
								}
							}
						}
					}

					return content;
				}, {});
		}
	}

	return {};
}
