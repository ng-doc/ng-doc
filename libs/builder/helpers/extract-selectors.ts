import {Decorator, Node} from 'ts-morph';

import {componentDecoratorResolver} from '../resolvers/component-decorator.resolver';
import {NgDocSupportedDeclarations} from '../types';

/**
 *
 * @param declaration
 */
export function extractSelectors(declaration: NgDocSupportedDeclarations): string[] {
	if (Node.isClassDeclaration(declaration)) {
		const decorator: Decorator | undefined = declaration.getDecorator('Component') ?? declaration.getDecorator('Directive');

		if (decorator) {
			const expression: Node | undefined = decorator.getArguments()[0];

			if (Node.isObjectLiteralExpression(expression)) {
				const selector: string = componentDecoratorResolver(expression).selector ?? '';

				return selector.split(',').map((s: string) => s.trim());
			}
		}
	}

	return [];
}
