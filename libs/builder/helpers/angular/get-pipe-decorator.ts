import {Pipe} from '@angular/core';
import {ClassDeclaration, Decorator, Node, ObjectLiteralElementLike} from 'ts-morph';

import {stringExpression} from '../string-expression';
import {getPropertyAssignment} from '../typescript';

/**
 *	Resolves the pipe decorator and return its properties.
 *
 * @param cls - class declaration
 */
export function getPipeDecorator(cls: ClassDeclaration): Pipe | undefined {
	const decorator: Decorator | undefined = cls.getDecorator('Pipe');
	const decoratorArgument: Node | undefined = decorator?.getArguments()[0];

	if (Node.isObjectLiteralExpression(decoratorArgument)) {
		const standaloneProperty: ObjectLiteralElementLike | undefined = decoratorArgument.getProperty('standalone');
		const nameProperty: ObjectLiteralElementLike | undefined = decoratorArgument.getProperty('name');

		return {
			standalone: stringExpression(getPropertyAssignment(standaloneProperty)),
			name: stringExpression(getPropertyAssignment(nameProperty)),
		};
	}

	return undefined;
}
