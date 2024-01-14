import { Node, SyntaxKind } from 'ts-morph';

import { isInputDecorator, isInputSignal, NgDocInputDeclaration } from './is-input';

/**
 * Returns the name of the component input.
 * @param property - The property declaration
 */
export function getInputName(property: NgDocInputDeclaration): string {
	if (isInputDecorator(property)) {
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
	}

	if (isInputSignal(property)) {
		const typeDeclaration = property.getType().getSymbol()?.getDeclarations()[0];

		if (Node.isInterfaceDeclaration(typeDeclaration) && Node.isPropertyDeclaration(property)) {
			const inputInitializer = property.getInitializerIfKind(SyntaxKind.CallExpression);
			const objectExpression = inputInitializer?.getArguments()[1];

			if (Node.isObjectLiteralExpression(objectExpression)) {
				const inputAliasProperty = objectExpression.getProperty('alias');

				if (Node.isPropertyAssignment(inputAliasProperty)) {
					return inputAliasProperty
						.getInitializerIfKindOrThrow(SyntaxKind.StringLiteral)
						.getLiteralText();
				}
			}
		}
	}

	return property.getName();
}
