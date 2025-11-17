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

  describe('input signal', () => {
    it('should return type for signature input without default value', () => {
      const sourceFile = project.createSourceFile(
        'index.ts',
        `
			import {Component, input} from '@angular/core';

			@Component({
				selector: 'app-root',
				template: '',
			})
			export class AppComponent {
				foo = input<string>('');
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

    it('should return type for model signal', () => {
      const sourceFile = project.createSourceFile(
        'index.ts',
        `
        import {Component, model} from '@angular/core';

        @Component({
          selector: 'app-root',
          template: '',
        })
        export class AppComponent {
          foo = model<string>();
        }
        `,
        { overwrite: true },
      );

      sourceFile.getProject().resolveSourceFileDependencies();
      const component = sourceFile.getClassOrThrow('AppComponent');
      const input = component.getPropertyOrThrow('foo');

      expect(getInputType(input).getText()).toBe('string | undefined');
    });

    it('should return inferred type for model signal', () => {
      const sourceFile = project.createSourceFile(
        'index.ts',
        `
        import {Component, model} from '@angular/core';

        @Component({
          selector: 'app-root',
          template: '',
        })
        export class AppComponent {
          foo = model(123);
        }
        `,
        { overwrite: true },
      );

      sourceFile.getProject().resolveSourceFileDependencies();
      const component = sourceFile.getClassOrThrow('AppComponent');
      const input = component.getPropertyOrThrow('foo');

      expect(getInputType(input).getText()).toBe('number');
    });

    it('should return type for model signal with transform', () => {
      const sourceFile = project.createSourceFile(
        'index.ts',
        `
        import {Component, model, coerceBooleanProperty} from '@angular/core';

        @Component({
          selector: 'app-root',
          template: '',
        })
        export class AppComponent {
          foo = model<boolean, string>(true, {transform: coerceBooleanProperty});
        }
        `,
        { overwrite: true },
      );

      sourceFile.getProject().resolveSourceFileDependencies();
      const component = sourceFile.getClassOrThrow('AppComponent');
      const input = component.getPropertyOrThrow('foo');

      expect(getInputType(input).getText()).toBe('boolean');
    });

    it('should return type for required model signal', () => {
      const sourceFile = project.createSourceFile(
        'index.ts',
        `
        import {Component, model} from '@angular/core';

        @Component({
          selector: 'app-root',
          template: '',
        })
        export class AppComponent {
          foo = model.required<string>();
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
});
