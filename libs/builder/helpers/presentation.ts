import {MethodDeclaration, ParameterDeclaration} from 'ts-morph';

import {displayType} from './typescript';

/**
 *
 * @param method
 */
export function methodPresentation(method: MethodDeclaration): string {
	const parameters: string = method.getParameters().map(parameterPresentation).join(', ');

	return `${method.getName()}(${parameters}): ${displayType(method.getReturnType())};`;
}

/**
 *
 * @param parameter
 */
function parameterPresentation(parameter: ParameterDeclaration): string {
	return `${parameter.getName()}${parameter.hasQuestionToken() ? '?' : ''}: ${displayType(parameter.getType())}${parameter.getInitializer() ? ` = ${parameter.getInitializer()}` : ''}`.trim();
}
