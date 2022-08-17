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

export interface NgDocExportedClass extends Omit<ClassDeclarationStructure, 'kind'> {
	kind: NgDocExportedDeclarationKind.Class;
}

export interface NgDocExportedInterface extends Omit<InterfaceDeclarationStructure, 'kind'> {
	kind: NgDocExportedDeclarationKind.Interface;
}

export interface NgDocExportedFunction extends Omit<FunctionDeclarationStructure, 'kind'> {
	kind: NgDocExportedDeclarationKind.Function;
}

export interface NgDocExportedEnum extends Omit<EnumDeclarationStructure, 'kind'> {
	kind: NgDocExportedDeclarationKind.Enum;
}

export interface NgDocExportedVariable extends Omit<VariableDeclarationStructure, 'kind'> {
	kind: NgDocExportedDeclarationKind.Variable;
}

export interface NgDocExportedModule extends Omit<ModuleDeclarationStructure, 'kind'> {
	kind: NgDocExportedDeclarationKind.Module;
}

export interface NgDocExportedFunctionOverload extends Omit<FunctionDeclarationOverloadStructure, 'kind'> {
	kind: NgDocExportedDeclarationKind.FunctionOverload;
}

export interface NgDocExportedTypeAlias extends Omit<TypeAliasDeclarationStructure, 'kind'> {
	kind: NgDocExportedDeclarationKind.TypeAlias;
}

export type NgDocExportedDeclaration =
	| NgDocExportedClass
	| NgDocExportedInterface
	| NgDocExportedFunction
	| NgDocExportedEnum
	| NgDocExportedVariable
	| NgDocExportedModule
	| NgDocExportedFunctionOverload
	| NgDocExportedTypeAlias;

export enum NgDocExportedDeclarationKind {
	Class = 2,
	Interface = 19,
	Function = 13,
	Enum = 8,
	Variable = 48,
	Module = 29,
	FunctionOverload = 14,
	TypeAlias = 38,
}
