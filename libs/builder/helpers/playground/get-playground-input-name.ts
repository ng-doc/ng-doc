import {Node, PropertyDeclaration} from 'ts-morph';

/**
 * Returns the name of the component input.
 *
 * @param property - The property declaration
 */
export function getPlaygroundInputName(property: PropertyDeclaration): string {
	const inputArgument = property.getDecorator('Input')?.getArguments()[0];

	if (Node.isStringLiteral(inputArgument)) {
		return inputArgument.getLiteralText().replace(/^["']|['"]$/g, '');
	}

	return property.getName();
}
