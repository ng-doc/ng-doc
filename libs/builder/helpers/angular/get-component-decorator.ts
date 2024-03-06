import { Component } from '@angular/core';
import { ClassDeclaration, Decorator, Node, ObjectLiteralElementLike } from 'ts-morph';

import { stringExpression } from '../string-expression';
import { getPropertyAssignment } from '../typescript';

/**
 *    Resolves the component decorator and return its properties.
 * @param cls - class declaration
 */
export function getComponentDecorator(cls: ClassDeclaration): Component | undefined {
	const decorator: Decorator | undefined = cls.getDecorator('Component');
	const decoratorArgument: Node | undefined = decorator?.getArguments()[0];

	if (Node.isObjectLiteralExpression(decoratorArgument)) {
		const standaloneProperty: ObjectLiteralElementLike | undefined =
			decoratorArgument.getProperty('standalone');
		const selectorProperty: ObjectLiteralElementLike | undefined =
			decoratorArgument.getProperty('selector');
		const templateProperty: ObjectLiteralElementLike | undefined =
			decoratorArgument.getProperty('templateUrl');
		const styleUrlProperty: ObjectLiteralElementLike | undefined =
			decoratorArgument.getProperty('styleUrl');
		const styleUrlsProperty: ObjectLiteralElementLike | undefined =
			decoratorArgument.getProperty('styleUrls');

		return {
			standalone: stringExpression(getPropertyAssignment(standaloneProperty)),
			selector: stringExpression(getPropertyAssignment(selectorProperty)),
			templateUrl: stringExpression(getPropertyAssignment(templateProperty)),
			styleUrl: stringExpression(getPropertyAssignment(styleUrlProperty)),
			styleUrls: stringExpression(getPropertyAssignment(styleUrlsProperty)),
		};
	}

	return undefined;
}
