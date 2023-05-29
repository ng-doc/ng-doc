import {ExportedDeclarations, Project} from 'ts-morph';

import {declarationFolderName} from '../declaration-folder-name';
import {createProject} from '../typescript/create-project';

describe('declarationFolderName', () => {
	let project: Project;

	beforeEach(() => {
		project = createProject({
			useInMemoryFileSystem: true,
			compilerOptions: {
				strict: true,
			},
		});
	});

	it('should return the folder name for classes', () => {
		const sourceFile = project.createSourceFile(
			'class.ts',
			`
			export class Test {}
		`,
		);
		const declaration = sourceFile.getClassOrThrow('Test');

		expect(declarationFolderName(declaration)).toBe('classes');
	});

	it('should return the folder name for interfaces', () => {
		const sourceFile = project.createSourceFile(
			'interface.ts',
			`
			export interface Test {}
		`,
		);
		const declaration = sourceFile.getInterfaceOrThrow('Test');

		expect(declarationFolderName(declaration)).toBe('interfaces');
	});

	it('should return the folder name for enums', () => {
		const sourceFile = project.createSourceFile(
			'enum.ts',
			`
			export enum Test {}
		`,
		);
		const declaration = sourceFile.getEnumOrThrow('Test');

		expect(declarationFolderName(declaration)).toBe('enums');
	});

	it('should return the folder name for type aliases', () => {
		const sourceFile = project.createSourceFile(
			'type-alias.ts',
			`
			export type Test = string;
		`,
		);
		const declaration = sourceFile.getTypeAliasOrThrow('Test');

		expect(declarationFolderName(declaration)).toBe('type-aliases');
	});

	it('should return the folder name for functions', () => {
		const sourceFile = project.createSourceFile(
			'function.ts',
			`
			export function test() {}
		`,
		);
		const declaration = sourceFile.getFunctionOrThrow('test');

		expect(declarationFolderName(declaration)).toBe('functions');
	});

	it('should return the folder name for variables', () => {
		const sourceFile = project.createSourceFile(
			'variable.ts',
			`
			export const test = '';
		`,
		);
		const declaration = sourceFile.getVariableDeclarationOrThrow('test');

		expect(declarationFolderName(declaration)).toBe('variables');
	});

	it('should return the folder name for modules', () => {
		const sourceFile = project.createSourceFile(
			'module.ts',
			`
			export module Test {}
		`,
		);
		const declaration = sourceFile.getModuleOrThrow('Test');

		expect(declarationFolderName(declaration)).toBe('modules');
	});

	it('should return the folder name for unknowns', () => {
		const sourceFile = project.createSourceFile(
			'unknown.ts',
			`
			export class Test {
				method() {}
			}
		`,
		);
		const declaration = sourceFile.getClassOrThrow('Test');

		expect(declarationFolderName(declaration.getMethodOrThrow('method') as unknown as ExportedDeclarations)).toBe(
			'unknowns',
		);
	});
});
