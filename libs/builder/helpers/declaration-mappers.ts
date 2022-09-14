import {
	asArray,
	NgDocExportedClass,
	NgDocExportedDeclaration,
	NgDocExportedEnum,
	NgDocExportedMember,
	NgDocExportedMethod,
	NgDocExportedMethodOverload,
	NgDocExportedParameter,
	NgDocExportedProperty,
	NgDocExportedType,
} from '@ng-doc/core';
import {
	ClassDeclaration,
	ClassDeclarationStructure,
	Decorator,
	EnumDeclaration,
	EnumDeclarationStructure,
	EnumMember,
	Expression,
	JSDoc,
	MethodDeclaration,
	MethodDeclarationOverloadStructure,
	MethodDeclarationStructure,
	Node,
	ParameterDeclaration,
	ParameterDeclarationStructure,
	PropertyDeclaration,
	PropertyDeclarationStructure,
	Type,
	TypeFormatFlags,
} from 'ts-morph';

import {NgDocSupportedDeclarations} from '../types';

/**
 *
 * @param declaration
 */
export function mapDeclaration(declaration: NgDocSupportedDeclarations): NgDocExportedDeclaration | undefined {
	if (Node.isClassDeclaration(declaration)) {
		return mapClassDeclaration(declaration);
	}

	if (Node.isEnumDeclaration(declaration)) {
		return mapEnumDeclaration(declaration);
	}

	return undefined;
}

/**
 *
 * @param declaration
 */
export function mapEnumDeclaration(declaration: EnumDeclaration): NgDocExportedEnum {
	const structure: EnumDeclarationStructure = declaration.getStructure();
	const {name, isExported, isDefaultExport} = structure;

	return {
		kind: 'Enum',
		name,
		isExported,
		isDefaultExport,
		members: declaration.getMembers().map(mapEnumMember),
		docs: declaration.getJsDocs().map(mapJsDoc).join('\n'),
	};
}

/**
 *
 * @param declaration
 */
export function mapClassDeclaration(declaration: ClassDeclaration): NgDocExportedClass {
	const structure: ClassDeclarationStructure = declaration.getStructure();
	const {name, isExported, isAbstract, isDefaultExport} = structure;

	return {
		kind: 'Class',
		name,
		isExported,
		isAbstract,
		isDefaultExport,
		implements: asArray(structure.implements).map(String),
		decorators: declaration.getDecorators().map(mapDecorator),
		properties: declaration.getProperties().map(mapProperty),
		methods: declaration.getMethods().map(mapMethod),
		docs: declaration.getJsDocs().map(mapJsDoc).join('\n'),
	};
}

/**
 *
 * @param declaration
 */
export function mapProperty(declaration: PropertyDeclaration): NgDocExportedProperty {
	const structure: PropertyDeclarationStructure = declaration.getStructure();
	const {
		name,
		isAbstract,
		hasExclamationToken,
		hasQuestionToken,
		hasOverrideKeyword,
		initializer,
		isReadonly,
		isStatic,
	} = structure;

	return {
		name,
		type: mapType(declaration.getType()),
		isAbstract,
		decorators: declaration.getDecorators().map(mapDecorator),
		hasExclamationToken,
		hasQuestionToken,
		hasOverrideKeyword,
		initializer: mapExpression(declaration.getInitializer()),
		isReadonly,
		isStatic,
		docs: declaration.getJsDocs().map(mapJsDoc).join('\n'),
	};
}

/**
 *
 * @param declaration
 */
export function mapMethod(declaration: MethodDeclaration): NgDocExportedMethod {
	const structure: MethodDeclarationStructure = declaration.getStructure() as MethodDeclarationStructure;

	const {name, isAsync, isAbstract, hasQuestionToken, hasOverrideKeyword, isStatic} = structure;

	return {
		name,
		returnType: mapType(declaration.getReturnType()),
		isAsync,
		isAbstract,
		decorators: declaration.getDecorators().map(mapDecorator),
		hasQuestionToken,
		hasOverrideKeyword,
		isStatic,
		parameters: declaration.getParameters().map(mapParameter),
		overloads: declaration.getOverloads().map(mapMethodOverload),
		docs: declaration.getJsDocs().map(mapJsDoc).join('\n'),
	};
}

/**
 *
 * @param declaration
 */
export function mapMethodOverload(declaration: MethodDeclaration): NgDocExportedMethodOverload {
	const structure: MethodDeclarationOverloadStructure =
		declaration.getStructure() as MethodDeclarationOverloadStructure;

	const {isAsync, isAbstract, hasQuestionToken, hasOverrideKeyword, isStatic} = structure;

	return {
		returnType: mapType(declaration.getReturnType()),
		isAsync,
		isAbstract,
		hasQuestionToken,
		hasOverrideKeyword,
		isStatic,
		parameters: declaration.getParameters().map(mapParameter),
		docs: declaration.getJsDocs().map(mapJsDoc).join('\n'),
	};
}

/**
 *
 * @param declaration
 */
export function mapParameter(declaration: ParameterDeclaration): NgDocExportedParameter {
	const structure: ParameterDeclarationStructure = declaration.getStructure();

	const {name, hasQuestionToken, hasOverrideKeyword, isReadonly} = structure;

	return {
		name,
		type: mapType(declaration.getType()),
		decorators: declaration.getDecorators().map(mapDecorator),
		hasQuestionToken,
		hasOverrideKeyword,
		initializer: mapExpression(declaration.getInitializer()),
		isReadonly,
	};
}

/**
 *
 * @param declaration
 */
export function mapEnumMember(declaration: EnumMember): NgDocExportedMember {
	return {
		name: declaration.getName(),
		value: String(declaration.getValue()),
		type: mapType(declaration.getType()),
		docs: declaration.getJsDocs().map(mapJsDoc).join('\n'),
	};
}

/**
 *
 * @param doc
 */
export function mapJsDoc(doc: JSDoc): string {
	return doc.getCommentText() ?? '';
}

/**
 *
 * @param type
 */
export function mapType(type: Type): NgDocExportedType {
	return type.getText(undefined, TypeFormatFlags.None);
}

/**
 *
 * @param decorator
 */
export function mapDecorator(decorator: Decorator): string {
	return decorator.getName();
}

/**
 *
 * @param expression
 */
export function mapExpression(expression?: Expression): string | undefined {
	return expression?.getText();
}
