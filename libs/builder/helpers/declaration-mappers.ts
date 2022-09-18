import {
	asArray,
	NgDocExportedClass,
	NgDocExportedDeclaration,
	NgDocExportedEnum,
	NgDocExportedFunction,
	NgDocExportedFunctionOverload,
	NgDocExportedInterface,
	NgDocExportedMember,
	NgDocExportedMethod,
	NgDocExportedMethodOverload,
	NgDocExportedMethodSignature,
	NgDocExportedParameter,
	NgDocExportedProperty,
	NgDocExportedPropertySignature,
	NgDocExportedType,
	NgDocExportedTypeAlias,
	NgDocExportedVariable,
} from '@ng-doc/core';
import {
	ClassDeclaration,
	ClassDeclarationStructure,
	Decorator,
	EnumDeclaration,
	EnumDeclarationStructure,
	EnumMember,
	Expression,
	FunctionDeclaration,
	FunctionDeclarationOverloadStructure,
	FunctionDeclarationStructure,
	InterfaceDeclaration,
	InterfaceDeclarationStructure,
	JSDoc,
	MethodDeclaration,
	MethodDeclarationOverloadStructure,
	MethodDeclarationStructure,
	MethodSignature,
	MethodSignatureStructure,
	Node,
	ParameterDeclaration,
	ParameterDeclarationStructure,
	PropertyDeclaration,
	PropertyDeclarationStructure,
	PropertySignature,
	PropertySignatureStructure,
	Type,
	TypeAliasDeclaration,
	TypeAliasDeclarationStructure,
	TypeFormatFlags,
	VariableDeclaration,
	VariableDeclarationStructure,
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

	if (Node.isInterfaceDeclaration(declaration)) {
		return mapInterfaceDeclaration(declaration);
	}

	if (Node.isEnumDeclaration(declaration)) {
		return mapEnumDeclaration(declaration);
	}

	if (Node.isTypeAliasDeclaration(declaration)) {
		return mapTypeAliasDeclaration(declaration);
	}

	if (Node.isFunctionDeclaration(declaration)) {
		return mapFunctionDeclaration(declaration);
	}

	if (Node.isVariableDeclaration(declaration)) {
		return mapVariableDeclaration(declaration);
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
export function mapTypeAliasDeclaration(declaration: TypeAliasDeclaration): NgDocExportedTypeAlias {
	const structure: TypeAliasDeclarationStructure = declaration.getStructure();
	const {name, isExported, isDefaultExport} = structure;

	return {
		kind: 'TypeAlias',
		name,
		isExported,
		isDefaultExport,
		code: declaration.getText(),
		docs: declaration.getJsDocs().map(mapJsDoc).join('\n'),
	};
}

/**
 *
 * @param declaration
 */
export function mapFunctionDeclaration(declaration: FunctionDeclaration): NgDocExportedFunction {
	const structure: FunctionDeclarationStructure = declaration.getStructure() as FunctionDeclarationStructure;
	const {isExported, isDefaultExport} = structure;

	return {
		kind: 'Function',
		name: structure.name ?? '',
		isExported,
		isDefaultExport,
		parameters: declaration.getParameters().map(mapParameter),
		overloads: declaration.getOverloads().map(mapFunctionOverloadDeclaration),
		returnType: mapType(declaration.getReturnType()),
		docs: declaration.getJsDocs().map(mapJsDoc).join('\n'),
	};
}

/**
 *
 * @param declaration
 */
export function mapFunctionOverloadDeclaration(declaration: FunctionDeclaration): NgDocExportedFunctionOverload {
	const structure: FunctionDeclarationOverloadStructure =
		declaration.getStructure() as FunctionDeclarationOverloadStructure;
	const {isExported, isDefaultExport} = structure;

	return {
		kind: 'FunctionOverload',
		name: declaration.getName() ?? '',
		isExported,
		isDefaultExport,
		parameters: declaration.getParameters().map(mapParameter),
		returnType: mapType(declaration.getReturnType()),
		docs: declaration.getJsDocs().map(mapJsDoc).join('\n'),
	};
}

/**
 *
 * @param declaration
 */
export function mapVariableDeclaration(declaration: VariableDeclaration): NgDocExportedVariable {
	const structure: VariableDeclarationStructure = declaration.getStructure();
	const {name} = structure;

	return {
		kind: 'Variable',
		name: name ?? '',
		type: mapType(declaration.getType()),
		docs: '',
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
export function mapInterfaceDeclaration(declaration: InterfaceDeclaration): NgDocExportedInterface {
	const structure: InterfaceDeclarationStructure = declaration.getStructure();
	const {name, isExported, isDefaultExport} = structure;

	return {
		kind: 'Interface',
		name,
		isExported,
		isDefaultExport,
		extends: asArray(structure.extends).map(String),
		properties: declaration.getProperties().map(mapPropertySignature),
		methods: declaration.getMethods().map(mapMethodSignature),
		docs: declaration.getJsDocs().map(mapJsDoc).join('\n'),
	};
}

/**
 *
 * @param declaration
 */
export function mapProperty(declaration: PropertyDeclaration): NgDocExportedProperty {
	const structure: PropertyDeclarationStructure = declaration.getStructure();
	const {name, isAbstract, hasExclamationToken, hasQuestionToken, hasOverrideKeyword, isReadonly, isStatic} =
		structure;

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
export function mapPropertySignature(declaration: PropertySignature): NgDocExportedPropertySignature {
	const structure: PropertySignatureStructure = declaration.getStructure();
	const {name, hasQuestionToken, isReadonly} = structure;

	return {
		name,
		type: mapType(declaration.getType()),
		hasQuestionToken,
		isReadonly,
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
export function mapMethodSignature(declaration: MethodSignature): NgDocExportedMethodSignature {
	const structure: MethodSignatureStructure = declaration.getStructure();

	const {name, hasQuestionToken} = structure;

	return {
		name,
		returnType: mapType(declaration.getReturnType()),
		hasQuestionToken,
		parameters: declaration.getParameters().map(mapParameter),
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
