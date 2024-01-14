import { Project } from 'ts-morph';

import { createProject } from '../../typescript';
import { getInputName } from '../get-input-name';

describe('getInputName', () => {
	let project: Project;

	beforeEach(() => {
		project = createProject({
			compilerOptions: {
				strict: true,
			},
		});
	});

	it('should return the name of the component input', () => {
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

		expect(getInputName(input)).toBe('foo');
	});

	it('should return the name of the component input with alias', () => {
		const sourceFile = project.createSourceFile(
			'index.ts',
			`
			import {Component, Input} from '@angular/core';

			@Component({
				selector: 'app-root',
				template: '',
			})
			export class AppComponent {
				@Input('bar') foo: string;
			}
		`,
			{ overwrite: true },
		);

		const component = sourceFile.getClassOrThrow('AppComponent');
		const input = component.getPropertyOrThrow('foo');

		expect(getInputName(input)).toBe('bar');
	});

	it('should return the name of the component input with alias (object)', () => {
		const sourceFile = project.createSourceFile(
			'index.ts',
			`
			import {Component, Input} from '@angular/core';

			@Component({
				selector: 'app-root',
				template: '',
			})
			export class AppComponent {
				@Input({alias: 'bar'}) foo: string;
			}
		`,
			{ overwrite: true },
		);

		const component = sourceFile.getClassOrThrow('AppComponent');
		const input = component.getPropertyOrThrow('foo');

		expect(getInputName(input)).toBe('bar');
	});

	it('should return the name of the get accessor input', () => {
		const sourceFile = project.createSourceFile(
			'index.ts',
			`
			import {Component, Input} from '@angular/core';

			@Component({
				selector: 'app-root',
				template: '',
			})
			export class AppComponent {
				@Input() get foo(): string {
					return '';
				}
			}
		`,
			{ overwrite: true },
		);

		const component = sourceFile.getClassOrThrow('AppComponent');
		const input = component.getGetAccessorOrThrow('foo');

		expect(getInputName(input)).toBe('foo');
	});

	it('should return the name of the get accessor input with alias', () => {
		const sourceFile = project.createSourceFile(
			'index.ts',
			`
			import {Component, Input} from '@angular/core';

			@Component({
				selector: 'app-root',
				template: '',
			})
			export class AppComponent {
				@Input('bar') get foo(): string {
					return '';
				}
			}
		`,
			{ overwrite: true },
		);

		const component = sourceFile.getClassOrThrow('AppComponent');
		const input = component.getGetAccessorOrThrow('foo');

		expect(getInputName(input)).toBe('bar');
	});

	it('should return the name of the set accessor input', () => {
		const sourceFile = project.createSourceFile(
			'index.ts',
			`
			import {Component, Input} from '@angular/core';

			@Component({
				selector: 'app-root',
				template: '',
			})
			export class AppComponent {
				@Input() set foo(value: string) {}
			}
		`,
			{ overwrite: true },
		);

		const component = sourceFile.getClassOrThrow('AppComponent');
		const input = component.getSetAccessorOrThrow('foo');

		expect(getInputName(input)).toBe('foo');
	});

	it('should return the name of the set accessor input with alias', () => {
		const sourceFile = project.createSourceFile(
			'index.ts',
			`
			import {Component, Input} from '@angular/core';

			@Component({
				selector: 'app-root',
				template: '',
			})
			export class AppComponent {
				@Input('bar') set foo(value: string) {}
			}
		`,
			{ overwrite: true },
		);

		const component = sourceFile.getClassOrThrow('AppComponent');
		const input = component.getSetAccessorOrThrow('foo');

		expect(getInputName(input)).toBe('bar');
	});

	it('should return the name of the signal input', () => {
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

		const component = sourceFile.getClassOrThrow('AppComponent');
		const input = component.getPropertyOrThrow('foo');

		expect(getInputName(input)).toBe('foo');
	});

	it('should return the name of the signal input with alias', () => {
		const sourceFile = project.createSourceFile(
			'index.ts',
			`
			import {Component, input} from '@angular/core';

			@Component({
				selector: 'app-root',
				template: '',
			})
			export class AppComponent {
				foo = input('foo', {alias: 'bar'});
			}
		`,
			{ overwrite: true },
		);

		const component = sourceFile.getClassOrThrow('AppComponent');
		const input = component.getPropertyOrThrow('foo');

		expect(getInputName(input)).toBe('bar');
	});
});
