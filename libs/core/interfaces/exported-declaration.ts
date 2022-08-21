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
}

export interface NgDocExportedFunction {
	kind: 'Function';
}

export interface NgDocExportedEnum {
	kind: 'Enum';
}

export interface NgDocExportedVariable {
	kind: 'Variable';
}

export interface NgDocExportedModule {
	kind: 'Module';
}

export interface NgDocExportedFunctionOverload {
	kind: 'FunctionOverload';
}

export interface NgDocExportedTypeAlias {
	kind: 'TypeAlias';
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

export interface NgDocExportedParameter {
	name: string;
	type: NgDocExportedType;
	decorators: string[];
	isReadonly?: boolean;
	hasQuestionToken?: boolean;
	hasOverrideKeyword?: boolean;
	initializer?: string;
}

export type NgDocExportedType = string;

export type NgDocExportedMethodOverload = Omit<NgDocExportedMethod, 'name' | 'overloads' | 'decorators'>;


