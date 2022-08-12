import {
	ClassDeclarationStructure,
	EnumDeclarationStructure,
	FunctionDeclarationOverloadStructure,
	FunctionDeclarationStructure,
	InterfaceDeclarationStructure,
	ModuleDeclarationStructure,
	TypeAliasDeclarationStructure,
	VariableDeclarationStructure,
} from 'ts-morph';

export type NgDocExportedDeclaration =
	| ClassDeclarationStructure
	| InterfaceDeclarationStructure
	| FunctionDeclarationStructure
	| EnumDeclarationStructure
	| VariableDeclarationStructure
	| ModuleDeclarationStructure
	| FunctionDeclarationOverloadStructure
	| TypeAliasDeclarationStructure;
