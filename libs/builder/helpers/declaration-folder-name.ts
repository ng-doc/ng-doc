import { ExportedDeclarations, Node } from 'ts-morph';

/**
 *
 * @param declaration
 */
export function declarationFolderName(declaration: ExportedDeclarations): string {
	if (Node.isClassDeclaration(declaration)) {
		return 'classes';
	} else if (Node.isInterfaceDeclaration(declaration)) {
		return 'interfaces';
	} else if (Node.isEnumDeclaration(declaration)) {
		return 'enums';
	} else if (Node.isFunctionDeclaration(declaration)) {
		return 'functions';
	} else if (Node.isVariableDeclaration(declaration)) {
		return 'variables';
	} else if (Node.isTypeAliasDeclaration(declaration)) {
		return 'type-aliases';
	} else if (Node.isModuleDeclaration(declaration)) {
		return 'modules';
	} else {
		return 'unknowns';
	}
}
