import {NgDocPlaygroundProperties} from '@ng-doc/core';
import {
	ClassDeclaration,
	Expression,
	JSDoc,
	Node,
	ObjectLiteralElementLike,
	ObjectLiteralExpression,
	PropertyDeclaration,
	Type,
} from 'ts-morph';

import {getPlaygroundById} from './get-playground-by-id';
import {displayType} from './typescript';

/**
 *
 * @param expression
 * @param playgroundId
 */
export function getTargetForPlayground(
	expression: ObjectLiteralExpression,
	playgroundId: string,
): ClassDeclaration | undefined {
	const playground: ObjectLiteralExpression | undefined = getPlaygroundById(expression, playgroundId);

	if (playground) {
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
	}

	return undefined;
}

/**
 *
 * @param expression
 * @param playgroundId
 */
export function getTemplateForPlayground(expression: ObjectLiteralExpression, playgroundId: string): string {
	const playground: ObjectLiteralExpression | undefined = getPlaygroundById(expression, playgroundId);

	if (playground) {
		const template: ObjectLiteralElementLike | undefined = playground.getProperty('template');

		if (Node.isPropertyAssignment(template)) {
			const templateInitializer: Expression | undefined = template.getInitializer();

			if (
				Node.isStringLiteral(templateInitializer) ||
				Node.isNoSubstitutionTemplateLiteral(templateInitializer)
			) {
				return templateInitializer.getLiteralValue();
			}
		}
	}

	return '';
}

/**
 *
 * @param expression
 * @param playgroundId
 */
export function getContentForPlayground(
	expression: ObjectLiteralExpression,
	playgroundId: string,
): Record<string, string> {
	const playground: ObjectLiteralExpression | undefined = getPlaygroundById(expression, playgroundId);

	if (playground) {
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
	}

	return {};
}

/**
 *
 * @param declaration
 */
export function getPlaygroundClassProperties(declaration: ClassDeclaration): NgDocPlaygroundProperties {
	return declaration
		.getProperties()
		.filter((property: PropertyDeclaration) => !!property.getDecorator('Input'))
		.reduce((properties: NgDocPlaygroundProperties, property: PropertyDeclaration) => {
			const inputName: string =
				property
					.getDecorator('Input')
					?.getArguments()[0]
					?.getText()
					.replace(/^["']|['"]$/g, '') ?? property.getName();

			properties[property.getName()] = {
				name: inputName,
				type: displayType(property.getType()),
				default: property.getInitializer()?.getText(),
				description: property
					.getJsDocs()
					.reduce((comment: string, doc: JSDoc) => `${comment}\n${doc.getCommentText()}`.trim(), ''),
				options: property
					.getType()
					.getUnionTypes()
					.map((type: Type) => displayType(type)),
			};

			return properties;
		}, {});
}
