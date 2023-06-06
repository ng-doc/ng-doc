import {Expression, Node, ObjectLiteralElementLike, ObjectLiteralExpression} from 'ts-morph';

/**
 *
 * @param expression
 * @param playgroundId
 * @param playground
 */
export function getTemplateForPlayground(playground: ObjectLiteralExpression): string {
	const template: ObjectLiteralElementLike | undefined = playground.getProperty('template');

	if (Node.isPropertyAssignment(template)) {
		const templateInitializer: Expression | undefined = template.getInitializer();

		if (Node.isStringLiteral(templateInitializer) || Node.isNoSubstitutionTemplateLiteral(templateInitializer)) {
			return templateInitializer.getLiteralValue();
		}
	}

	return '';
}
