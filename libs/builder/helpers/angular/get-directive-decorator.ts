import { Directive } from '@angular/core';
import { ClassDeclaration, Decorator, Node, ObjectLiteralElementLike } from 'ts-morph';

import { stringExpression } from '../string-expression';
import { getPropertyAssignment } from '../typescript';

/**
 *    Resolves the directive decorator and return its properties.
 * @param cls - class declaration
 */
export function getDirectiveDecorator(cls: ClassDeclaration): Directive | undefined {
	const decorator: Decorator | undefined = cls.getDecorator('Directive');
	const decoratorArgument: Node | undefined = decorator?.getArguments()[0];

	if (Node.isObjectLiteralExpression(decoratorArgument)) {
		const standaloneProperty: ObjectLiteralElementLike | undefined =
			decoratorArgument.getProperty('standalone');
		const selectorProperty: ObjectLiteralElementLike | undefined =
			decoratorArgument.getProperty('selector');

		return {
			standalone: stringExpression(getPropertyAssignment(standaloneProperty)),
			selector: stringExpression(getPropertyAssignment(selectorProperty)),
		};
	}

	return undefined;
}
