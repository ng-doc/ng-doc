export interface NgDocExportedClass {
	kind: 'Class';
	name?: string;
	isExported?: boolean;
	isAbstract?: boolean;
	isDefaultExport?: boolean;
	implements: string[];
	decorators: string[];
	properties: NgDocExportedProperty[];
	methods: NgDocExportedMethod[];
	docs: string;
}

export interface NgDocExportedInterface {
	kind: 'Interface';
	name: string;
	isExported?: boolean;
	isDefaultExport?: boolean;
	extends: string[];
	properties: NgDocExportedPropertySignature[];
	methods: NgDocExportedMethodSignature[];
	docs: string;
}

export interface NgDocExportedFunction {
	kind: 'Function';
	name: string;
	isExported?: boolean;
	isDefaultExport?: boolean;
	parameters: NgDocExportedParameter[];
	overloads: NgDocExportedFunctionOverload[];
	returnType: string;
	docs: string;
}

export interface NgDocExportedFunctionOverload {
	kind: 'FunctionOverload';
	name: string;
	isExported?: boolean;
	isDefaultExport?: boolean;
	parameters: NgDocExportedParameter[];
	returnType: string;
	docs: string;
}

export interface NgDocExportedEnum {
	kind: 'Enum';
	name: string;
	isExported?: boolean;
	isDefaultExport?: boolean;
	members: NgDocExportedMember[];
	docs: string;
}

export interface NgDocExportedVariable {
	kind: 'Variable';
	name: string;
	isExported?: boolean;
	isDefaultExport?: boolean;
	declarationKind: string;
	type: string;
	docs: string;
}

export interface NgDocExportedTypeAlias {
	kind: 'TypeAlias';
	name: string;
	isExported?: boolean;
	isDefaultExport?: boolean;
	code: string;
	docs: string;
}

export type NgDocExportedDeclaration =
	| NgDocExportedClass
	| NgDocExportedInterface
	| NgDocExportedFunction
	| NgDocExportedEnum
	| NgDocExportedVariable
	| NgDocExportedFunctionOverload
	| NgDocExportedTypeAlias;

export type NgDocExportedDeclarationKind = NgDocExportedDeclaration['kind'];

export interface NgDocExportedProperty {
	name: string;
	type: NgDocExportedType;
	isAbstract?: boolean;
	isReadonly?: boolean;
	isStatic?: boolean;
	hasExclamationToken?: boolean;
	hasQuestionToken?: boolean;
	hasOverrideKeyword?: boolean;
	decorators: string[];
	initializer?: string;
	docs: string;
}

export interface NgDocExportedPropertySignature {
	name: string;
	type: NgDocExportedType;
	isReadonly?: boolean;
	hasQuestionToken?: boolean;
	docs: string;
}

export interface NgDocExportedMethod {
	name: string;
	returnType: NgDocExportedType;
	isAsync?: boolean;
	isAbstract?: boolean;
	hasQuestionToken?: boolean;
	hasOverrideKeyword?: boolean;
	isStatic?: boolean;
	decorators: string[];
	parameters: NgDocExportedParameter[];
	overloads: NgDocExportedMethodOverload[];
	docs: string;
}

export interface NgDocExportedMethodSignature {
	name: string;
	returnType: NgDocExportedType;
	hasQuestionToken?: boolean;
	parameters: NgDocExportedParameter[];
	docs: string;
}

export interface NgDocExportedParameter {
	name: string;
	type: NgDocExportedType;
	decorators: string[];
	isReadonly?: boolean;
	hasQuestionToken?: boolean;
	hasOverrideKeyword?: boolean;
	initializer?: string;
	docs: string;
}

export interface NgDocExportedMember {
	name: string;
	value: string;
	type: string;
	docs: string;
}

export type NgDocExportedType = string;

export type NgDocExportedMethodOverload = Omit<NgDocExportedMethod, 'name' | 'overloads' | 'decorators'>;


