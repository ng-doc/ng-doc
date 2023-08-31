import { ExportedDeclarations, Node } from 'ts-morph';

import { NgDocSupportedDeclarations } from '../types/supported-declarations';

/**
 *
 * @param declaration
 */
export function isSupportedDeclaration(
	declaration: ExportedDeclarations,
): declaration is NgDocSupportedDeclarations {
	return (
		Node.isClassDeclaration(declaration) ||
		Node.isInterfaceDeclaration(declaration) ||
		Node.isEnumDeclaration(declaration) ||
		Node.isFunctionDeclaration(declaration) ||
		Node.isVariableDeclaration(declaration) ||
		Node.isTypeAliasDeclaration(declaration) ||
		Node.isModuleDeclaration(declaration)
	);
}
