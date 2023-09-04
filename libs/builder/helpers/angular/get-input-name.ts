import { Node, PropertyDeclaration, SyntaxKind } from 'ts-morph';

/**
 * Returns the name of the component input.
 *
 * @param property - The property declaration
 */
export function getInputName(property: PropertyDeclaration): string {
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
