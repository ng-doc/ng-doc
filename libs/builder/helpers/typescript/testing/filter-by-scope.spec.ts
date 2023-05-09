import {ClassDeclaration, Project, PropertyDeclaration, Scope, SourceFile} from 'ts-morph';

import {createProject} from '../create-project';
import {filterByScope} from '../filter-by-scope';

describe('filterByScope', () => {
	let project: Project;

	beforeEach(() => {
		project = createProject({useInMemoryFileSystem: true});
	});

	it('should return private members', () => {
		const sourceFile: SourceFile = project.createSourceFile(
			'class.ts',
			`
				class Test {
					publicProperty1: string;
					public publicProperty2: string;
					private privateProperty1: string;
					private privateProperty2: string;
					protected protectedProperty1: string;
					protected protectedProperty2: string;
				}
			`,
		);
		const declaration: ClassDeclaration = sourceFile.getClassOrThrow('Test');

		expect(
			filterByScope(declaration.getProperties(), Scope.Public).map((property: PropertyDeclaration) =>
				property.getName(),
			),
		).toStrictEqual(['publicProperty1', 'publicProperty2']);
	});

	it('should return private and protected members', () => {
		const sourceFile: SourceFile = project.createSourceFile(
			'class.ts',
			`
				class Test {
					publicProperty1: string;
					public publicProperty2: string;
					private privateProperty1: string;
					private privateProperty2: string;
					protected protectedProperty1: string;
					protected protectedProperty2: string;
				}
			`,
		);
		const declaration: ClassDeclaration = sourceFile.getClassOrThrow('Test');

		expect(
			filterByScope(declaration.getProperties(), [Scope.Private, Scope.Protected]).map((property: PropertyDeclaration) =>
				property.getName(),
			),
		).toStrictEqual(['privateProperty1', 'privateProperty2', 'protectedProperty1', 'protectedProperty2']);
	})
});
