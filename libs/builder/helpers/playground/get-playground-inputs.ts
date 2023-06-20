import {NgDocPlaygroundProperties} from '@ng-doc/core';
import {
	ClassDeclaration,
	Node,
	ParameterDeclaration,
	PropertyDeclaration,
	SyntaxKind,
	Type,
	TypeFormatFlags,
} from 'ts-morph';

import {extractDocs, extractParameterDocs} from '../extract-docs';
import {displayType} from '../typescript';
import {getPlaygroundInputName} from './get-playground-input-name';

/**
 *
 * @param declaration
 */
export function getPlaygroundComponentInputs(declaration: ClassDeclaration): NgDocPlaygroundProperties {
	return declaration
		.getProperties()
		.filter((property: PropertyDeclaration) => !!property.getDecorator('Input'))
		.reduce((properties: NgDocPlaygroundProperties, property: PropertyDeclaration) => {
			const inputName: string = getPlaygroundInputName(property);

			return {...properties, ...propOrParamToPlaygroundProperty(property, inputName)};
		}, {});
}

/**
 *
 * @param declaration
 */
export function getPlaygroundPipeInputs(declaration: ClassDeclaration): NgDocPlaygroundProperties {
	return declaration
		.getMethodOrThrow('transform')
		.getParameters()
		.slice(1)
		.reduce((properties: NgDocPlaygroundProperties, parameter: ParameterDeclaration) => {
			return {...properties, ...propOrParamToPlaygroundProperty(parameter)};
		}, {});
}

/**
 *
 * @param propOrParam
 * @param inputName
 */
function propOrParamToPlaygroundProperty(
	propOrParam: PropertyDeclaration | ParameterDeclaration,
	inputName?: string,
): NgDocPlaygroundProperties {
	const type: string = displayType(
		propOrParam,
		TypeFormatFlags.NoTruncation | TypeFormatFlags.UseSingleQuotesForStringLiteralType,
	);

	return {
		[propOrParam.getName()]: {
			inputName: inputName ?? propOrParam.getName(),
			type,
			default: propOrParam.getInitializer()?.getText() ?? defaultForType(type),
			description: Node.isPropertyDeclaration(propOrParam)
				? extractDocs(propOrParam)
				: extractParameterDocs(propOrParam.getParentIfKindOrThrow(SyntaxKind.MethodDeclaration), propOrParam.getName()),
			options: propOrParam
				.getType()
				.getUnionTypes()
				.map((type: Type) =>
					type.getText(undefined, TypeFormatFlags.NoTruncation | TypeFormatFlags.UseSingleQuotesForStringLiteralType),
				),
		},
	};
}

/**
 *
 * @param type
 */
function defaultForType(type: string): string {
	switch (type) {
		case 'boolean':
			return 'false';
		default:
			return 'undefined';
	}
}
