import {ClassDeclaration, MethodDeclaration, Project, PropertyDeclaration, SourceFile} from 'ts-morph';

import {createProject} from '../create-project';
import {filterByStatic} from '../filter-by-static';

describe('filterByScope', () => {
	let project: Project;

	beforeEach(() => {
		project = createProject({useInMemoryFileSystem: true});
	});

	it('should return static property', () => {
		const sourceFile: SourceFile = project.createSourceFile(
			'class.ts',
			`
				class Test {
					static property1: string;
					property2: string;
				}
			`,
		);
		const declaration: ClassDeclaration = sourceFile.getClassOrThrow('Test');

		expect(
			filterByStatic(declaration.getProperties(), true).map((property: PropertyDeclaration) => property.getName()),
		).toStrictEqual(['property1']);
	});

	it('should return non-static property', () => {
		const sourceFile: SourceFile = project.createSourceFile(
			'class.ts',
			`
				class Test {
					static property1: string;
					property2: string;
				}
			`,
		);
		const declaration: ClassDeclaration = sourceFile.getClassOrThrow('Test');

		expect(
			filterByStatic(declaration.getProperties(), false).map((property: PropertyDeclaration) => property.getName()),
		).toStrictEqual(['property2']);
	});

	it('should return static method', () => {
		const sourceFile: SourceFile = project.createSourceFile(
			'class.ts',
			`
				class Test {
					static method1() {}
					method2() {}
				}
			`,
		);
		const declaration: ClassDeclaration = sourceFile.getClassOrThrow('Test');

		expect(
			filterByStatic(declaration.getMethods(), true).map((method: MethodDeclaration) => method.getName()),
		).toStrictEqual(['method1']);
	});

	it('should return non-static method', () => {
		const sourceFile: SourceFile = project.createSourceFile(
			'class.ts',
			`
				class Test {
					static method1() {}
					method2() {}
				}
			`,
		);
		const declaration: ClassDeclaration = sourceFile.getClassOrThrow('Test');

		expect(
			filterByStatic(declaration.getMethods(), false).map((method: MethodDeclaration) => method.getName()),
		).toStrictEqual(['method2']);
	});
});
