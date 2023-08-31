import { ClassDeclaration, Project, SourceFile } from 'ts-morph';

import { createProject } from '../create-project';
import { firstNodeWithComment } from '../first-node-with-comment';

//*
describe('firstNodeWithComment', () => {
	let project: Project;

	beforeEach(() => {
		project = createProject({ useInMemoryFileSystem: true });
	});

	it('should return first node that has JSDoc comment', () => {
		const sourceFile: SourceFile = project.createSourceFile(
			'class.ts',
			`
				class Test {
					method(param = 'string'): string {
						return param;
					}
				}

				/**
				 * Test2
				*/
				class Test2 {

				}

				/**
				 * Test3
				*/
				class Test3 {

				}
			`,
		);
		const declarations: ClassDeclaration[] = sourceFile.getClasses();

		expect(firstNodeWithComment(declarations).getName()).toBe(`Test2`);
	});
});
