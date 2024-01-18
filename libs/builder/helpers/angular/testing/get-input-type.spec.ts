import { Project } from 'ts-morph';

import { createProject } from '../../typescript';
import { getInputType } from '../get-input-type';

describe('getInputType', () => {
	let project: Project;

	beforeEach(() => {
		project = createProject({
			compilerOptions: {
				strict: true,
			},
		});
	});

	it('should return type for decorator input', () => {
		const sourceFile = project.createSourceFile(
			'index.ts',
			`
			import {Component, Input} from '@angular/core';

			@Component({
				selector: 'app-root',
				template: '',
			})
			export class AppComponent {
				@Input() foo: string;
			}
		`,
			{ overwrite: true },
		);

		sourceFile.getProject().resolveSourceFileDependencies();
		const component = sourceFile.getClassOrThrow('AppComponent');
		const input = component.getPropertyOrThrow('foo');

		expect(getInputType(input).getText()).toBe('string');
	});

	it('should return inferred type for signature input', () => {
		const sourceFile = project.createSourceFile(
			'index.ts',
			`
			import {Component, input} from '@angular/core';

			@Component({
				selector: 'app-root',
				template: '',
			})
			export class AppComponent {
				foo = input('foo');
			}
		`,
			{ overwrite: true },
		);

		sourceFile.getProject().resolveSourceFileDependencies();
		const component = sourceFile.getClassOrThrow('AppComponent');
		const input = component.getPropertyOrThrow('foo');

		expect(getInputType(input).getText()).toBe('string');
	});

	it('should return type for input', () => {
		const sourceFile = project.createSourceFile(
			'index.ts',
			`
			import {Component, input, coerceNumberProperty} from '@angular/core';

			@Component({
				selector: 'app-root',
				template: '',
			})
			export class AppComponent {
				foo = input<number, string>(123, {transform: coerceNumberProperty});
			}
		`,
			{ overwrite: true },
		);

		sourceFile.getProject().resolveSourceFileDependencies();
		const component = sourceFile.getClassOrThrow('AppComponent');
		const input = component.getPropertyOrThrow('foo');

		expect(getInputType(input).getText()).toBe('number');
	});

	it('should return type for required input', () => {
		const sourceFile = project.createSourceFile(
			'index.ts',
			`
			import {Component, input} from '@angular/core';

			@Component({
				selector: 'app-root',
				template: '',
			})
			export class AppComponent {
				foo = input.required<string>();
			}
		`,
			{ overwrite: true },
		);

		sourceFile.getProject().resolveSourceFileDependencies();
		const component = sourceFile.getClassOrThrow('AppComponent');
		const input = component.getPropertyOrThrow('foo');

		expect(getInputType(input).getText()).toBe('string');
	});
});
