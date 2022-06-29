import {
	ClassDeclaration,
	EnumDeclaration,
	FunctionDeclaration,
	InterfaceDeclaration,
	ModuleDeclaration,
	TypeAliasDeclaration,
	VariableDeclaration,
} from 'ts-morph';

export type NgDocSupportedDeclarations =
	| ClassDeclaration
	| InterfaceDeclaration
	| EnumDeclaration
	| FunctionDeclaration
	| VariableDeclaration
	| TypeAliasDeclaration
	| ModuleDeclaration;
