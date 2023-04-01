import {isPresent} from '@ng-doc/core';
import {
	AccessorDeclaration,
	ConstructorDeclaration,
	DecoratableNode,
	Decorator,
	FunctionDeclaration,
	MethodDeclaration,
	Node,
	ParameterDeclaration,
	ReadonlyableNode,
	Scope,
	ScopeableNode,
	TypeAliasDeclaration,
	VariableDeclaration,
} from 'ts-morph';

import {formatCode} from './format-code';
import {displayType} from './typescript';

/**
 *
 * @param constructor
 */
export function constructorPresentation(constructor: ConstructorDeclaration): string {
	const parameters: string = constructor.getParameters().map(parameterPresentation).join(', \n	');

	const presentation: string = [
		scopePresentation(constructor),
		`constructor(\n	${parameters}\n):`,
		displayType(constructor.getReturnType()),
	]
		.filter(isPresent)
		.join(' ');

	return formatCode(presentation, 'TypeScript');
}

/**
 *
 * @param accessor
 */
export function accessorPresentation(accessor: AccessorDeclaration): string {
	const parameters: string = accessor.getParameters().map(parameterPresentation).join(', ');
	const prefix: string = Node.isGetAccessorDeclaration(accessor) ? 'get' : 'set';
	const header: string = Node.isGetAccessorDeclaration(accessor)
		? `${accessor.getName()}():`
		: `${accessor.getName()}(${parameters})`;
	const returnType: string = Node.isGetAccessorDeclaration(accessor) ? displayType(accessor.getReturnType()) : '';

	const presentation: string = [prefix, scopePresentation(accessor), header, returnType].filter(isPresent).join(' ') + ';';

	return formatCode(presentation, 'TypeScript');
}

/**
 *
 * @param method
 */
export function methodPresentation(method: MethodDeclaration): string {
	const parameters: string = method.getParameters().map(parameterPresentation).join(', ');

	const presentation: string =  [scopePresentation(method), `${method.getName()}(${parameters}):`, `${displayType(method.getReturnType())};`]
		.filter(isPresent)
		.join(' ');

	return formatCode(presentation, 'TypeScript');
}

/**
 *
 * @param fnc
 */
export function functionPresentation(fnc: FunctionDeclaration): string {
	const parameters: string = fnc.getParameters().map(parameterPresentation).join(', ');

	const presentation: string =  ['function', `${fnc.getName()}(${parameters}):`, `${displayType(fnc.getReturnType())};`]
		.filter(isPresent)
		.join(' ');

	return formatCode(presentation, 'TypeScript');
}

/**
 *
 * @param typeAlias
 */
export function typeAliasPresentation(typeAlias: TypeAliasDeclaration): string {
	const presentation: string = `type ${typeAlias.getName()} = ${displayType(typeAlias.getType())};`;

	return formatCode(presentation, "TypeScript");
}

/**
 *
 * @param variable
 */
export function variablePresentation(variable: VariableDeclaration): string {
	const presentation: string =  [
		variable.getVariableStatement()?.getDeclarationKind() ?? 'const',
		`${variable.getName()}:`,
		`${displayType(variable.getType())};`,
	]
		.filter(isPresent)
		.join(' ');

	return formatCode(presentation, 'TypeScript');
}

/**
 *
 * @param parameter
 */
function parameterPresentation(parameter: ParameterDeclaration): string {
	return [
		decoratorsPresentation(parameter),
		scopePresentation(parameter),
		modPresentation(parameter),
		parameter.getName() + (parameter.hasQuestionToken() ? '?' : '') + ':',
		displayType(parameter.getType()),
		parameter.getInitializer() ? `= ${parameter.getInitializer()}` : '',
	]
		.filter(isPresent)
		.join(' ');
}

/**
 *
 * @param node
 */
function scopePresentation(node: ScopeableNode): string {
	return (node.getScope && node.getScope()?.replace(Scope.Public, '')) ?? '';
}

/**
 *
 * @param node
 */
function modPresentation(node: ReadonlyableNode): string {
	return (node.isReadonly && node.isReadonly() && 'readonly') || '';
}

/**
 *
 * @param node
 */
function decoratorsPresentation(node: DecoratableNode): string {
	return node
		.getDecorators()
		.map((d: Decorator) => `@${d.getName()}()`)
		.join(' ');
}
