import { Node, Project, SourceFile } from 'ts-morph';

import { getComponentInputs, NgDocInputDeclaration } from '../angular/get-component-inputs';
import { createProject } from '../typescript/create-project';

/**
 *
 * @param inputs
 */
function mapInputs(inputs: NgDocInputDeclaration[]) {
	return inputs.map((p) => ({
		propertyName: p.getName(),
		initializer: Node.isPropertyDeclaration(p) ? p.getInitializer()?.getText() : '',
		type: p.getType().getApparentType().getText(),
	}));
}

describe('getComponentInputs', () => {
	let project: Project;

	beforeEach(() => {
		project = createProject({ useInMemoryFileSystem: true });
	});

	it('should return inputs of a component', () => {
		const sourceFile: SourceFile = project.createSourceFile(
			'class.ts',
			`
				import { Component, Input } from '@angular/core';

				@Component()
				export class TestComponent {
					@Input() input1: string = '1';
					@Input() input2: number = 1500;
				}
			`,
		);
		const declaration = sourceFile.getClassOrThrow('TestComponent');
		const inputs = getComponentInputs(declaration);

		expect(mapInputs(inputs)).toEqual([
			{
				propertyName: 'input1',
				initializer: "'1'",
				type: 'String',
			},
			{
				propertyName: 'input2',
				initializer: '1500',
				type: 'Number',
			},
		]);
	});

	it('should return inputs from parent component', () => {
		const sourceFile: SourceFile = project.createSourceFile(
			'class.ts',
			`
				import { Component, Input } from '@angular/core';

				@Component()
				export class ParentComponent {
					@Input() parentInput: string = '123'
					@Input() parentInput2: number = 10000
				}

				@Component()
				export class TestComponent extends ParentComponent {
					@Input() override parentInput2: number = 25000
				}
			`,
		);
		const declaration = sourceFile.getClassOrThrow('TestComponent');
		const inputs = getComponentInputs(declaration);

		expect(mapInputs(inputs)).toEqual([
			{
				propertyName: 'parentInput2',
				initializer: '25000',
				type: 'Number',
			},
			{
				propertyName: 'parentInput',
				initializer: "'123'",
				type: 'String',
			},
		]);
	});

	it('should return inputs from getter', () => {
		const sourceFile: SourceFile = project.createSourceFile(
			'class.ts',
			`
				import { Component, Input } from '@angular/core';

				@Component()
				export class TestComponent {
					@Input() get input1(): string {
						return '1';
					}
				}
			`,
		);
		const declaration = sourceFile.getClassOrThrow('TestComponent');
		const inputs = getComponentInputs(declaration);

		expect(mapInputs(inputs)).toEqual([
			{
				propertyName: 'input1',
				initializer: '',
				type: 'String',
			},
		]);
	});

	it('should return inputs from setter', () => {
		const sourceFile: SourceFile = project.createSourceFile(
			'class.ts',
			`
				import { Component, Input } from '@angular/core';

				@Component()
				export class TestComponent {
					@Input() set input1(value: string) {
						console.log(value);
					}
				}
			`,
		);
		const declaration = sourceFile.getClassOrThrow('TestComponent');
		const inputs = getComponentInputs(declaration);

		expect(mapInputs(inputs)).toEqual([
			{
				propertyName: 'input1',
				initializer: '',
				type: 'String',
			},
		]);
	});
});
