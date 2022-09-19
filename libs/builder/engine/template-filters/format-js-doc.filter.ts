import {JSDoc, Node} from 'ts-morph';

import {NgDocSupportedDeclarations} from '../../types';

/**
 *
 * @param declaration
 */
export function formatJsDoc(declaration: NgDocSupportedDeclarations): string {
	if (Node.isClassDeclaration(declaration)) {
		return declaration.getJsDocs().map((d: JSDoc) => d.getInnerText()).join('\n');
	}

	if (Node.isInterfaceDeclaration(declaration)) {
		return declaration.getJsDocs().map((d: JSDoc) => d.getInnerText()).join('\n');
	}

	if (Node.isEnumDeclaration(declaration)) {
		return declaration.getJsDocs().map((d: JSDoc) => d.getInnerText()).join('\n');
	}

	if (Node.isTypeAliasDeclaration(declaration)) {
		return declaration.getJsDocs().map((d: JSDoc) => d.getInnerText()).join('\n');
	}

	if (Node.isVariableDeclaration(declaration)) {
		return declaration.getVariableStatement()?.getJsDocs().map((d: JSDoc) => d.getInnerText()).join('\n') ?? '';
	}

	if (Node.isFunctionDeclaration(declaration)) {
		return declaration.getJsDocs().map((d: JSDoc) => d.getStructure().description).join('\n');
	}

	return '';
}
