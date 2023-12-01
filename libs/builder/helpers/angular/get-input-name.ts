import { Node, SyntaxKind } from 'ts-morph';

import { NgDocInputDeclaration } from './get-component-inputs';

/**
 * Returns the name of the component input.
 * @param property - The property declaration
 */
export function getInputName(property: NgDocInputDeclaration): string {
	const inputArgument = property.getDecorator('Input')?.getArguments()[0];

	if (Node.isStringLiteral(inputArgument)) {
		return inputArgument.getLiteralText().replace(/^["']|['"]$/g, '');
	}

	if (Node.isObjectLiteralExpression(inputArgument)) {
		const inputAliasProperty = inputArgument.getProperty('alias');

		if (Node.isPropertyAssignment(inputAliasProperty)) {
			return inputAliasProperty
				.getInitializerIfKindOrThrow(SyntaxKind.StringLiteral)
				.getLiteralText();
		}
	}

	return property.getName();
}
