import {
  ConstructorDeclaration,
  FunctionDeclaration,
  GetAccessorDeclaration,
  MethodDeclaration,
  Project,
  SetAccessorDeclaration,
  SourceFile,
  TypeAliasDeclaration,
  VariableDeclaration,
} from 'ts-morph';

import { formatCode } from '../format-code';
import {
  accessorPresentation,
  constructorPresentation,
  functionPresentation,
  methodPresentation,
  typeAliasPresentation,
  variablePresentation,
} from '../presentation';
import { createProject } from '../typescript/create-project';

describe('presentation', () => {
  let project: Project;

  beforeEach(() => {
    project = createProject({
      useInMemoryFileSystem: true,
      compilerOptions: {
        strict: true,
      },
    });
  });

  describe('Function', () => {
    it('should display presentation', () => {
      const sourceFile: SourceFile = project.createSourceFile(
        'code.ts',
        `
				function test(param1: string, param2 = false): string {
					return param;
				}
			`,
      );
      const declaration: FunctionDeclaration = sourceFile.getFunctionOrThrow('test');

      expect(functionPresentation(declaration)).toBe(
        formatCode(`function test(param1: string, param2: boolean = false): string;`),
      );
    });

    it('should parameters object value', () => {
      const sourceFile: SourceFile = project.createSourceFile(
        'code.ts',
        `
				function test(param = {value: false}): string {
					return param;
				}
			`,
      );
      const declaration: FunctionDeclaration = sourceFile.getFunctionOrThrow('test');

      expect(functionPresentation(declaration)).toBe(
        formatCode(`function test(param: { value: boolean; } = {value: false}): string;`),
      );
    });

    it('should display parameters array value', () => {
      const sourceFile: SourceFile = project.createSourceFile(
        'code.ts',
        `
				function test(param = [false]): string {
					return param;
				}
			`,
      );
      const declaration: FunctionDeclaration = sourceFile.getFunctionOrThrow('test');

      expect(functionPresentation(declaration)).toBe(
        formatCode(`function test(param: boolean[] = [false]): string;`),
      );
    });

    it('should display parameters array of objects value', () => {
      const sourceFile: SourceFile = project.createSourceFile(
        'code.ts',
        `
				function test(param = [{value: false}]): string {
					return param;
				}
			`,
      );
      const declaration: FunctionDeclaration = sourceFile.getFunctionOrThrow('test');

      expect(functionPresentation(declaration)).toBe(
        formatCode(`function test(param: { value: boolean; }[] = [{value: false}]): string;`),
      );
    });

    it('should display parameters decorators', () => {
      const sourceFile: SourceFile = project.createSourceFile(
        'code.ts',
        `
				function test(@Inject() param: string): string {
					return param;
				}
			`,
      );
      const declaration: FunctionDeclaration = sourceFile.getFunctionOrThrow('test');

      expect(functionPresentation(declaration)).toBe(
        formatCode(`function test(@Inject() param: string): string;`),
      );
    });

    it('should display parameters mod', () => {
      const sourceFile: SourceFile = project.createSourceFile(
        'code.ts',
        `
				function test(readonly param: string): string {
					return param;
				}
			`,
      );
      const declaration: FunctionDeclaration = sourceFile.getFunctionOrThrow('test');

      expect(functionPresentation(declaration)).toBe(
        formatCode(`function test(readonly param: string): string;`),
      );
    });

    it('should display question token for optional parameters', () => {
      const sourceFile: SourceFile = project.createSourceFile(
        'code.ts',
        `
				function test(param?: string): string {
					return param;
				}
			`,
      );
      const declaration: FunctionDeclaration = sourceFile.getFunctionOrThrow('test');

      expect(functionPresentation(declaration)).toBe(
        formatCode(`function test(param?: string | undefined): string;`),
      );
    });
  });

  describe('Constructor', () => {
    it('should display presentation', () => {
      const sourceFile: SourceFile = project.createSourceFile(
        'code.ts',
        `
				class Test {
					constructor(param1: string, param2 = false) {}
				}
			`,
      );
      const declaration: ConstructorDeclaration = sourceFile
        .getClassOrThrow('Test')
        .getConstructors()[0];

      expect(constructorPresentation(declaration)).toBe(
        formatCode(`constructor(\n\tparam1: string, \n\tparam2: boolean = false\n): Test;`),
      );
    });

    it('should display scope of parameters', () => {
      const sourceFile: SourceFile = project.createSourceFile(
        'code.ts',
        `
				class Test {
					constructor(private param1: string, public param2 = false) {}
				}
			`,
      );
      const declaration: ConstructorDeclaration = sourceFile
        .getClassOrThrow('Test')
        .getConstructors()[0];

      expect(constructorPresentation(declaration)).toBe(
        formatCode(`constructor(\n\tprivate param1: string, \n\tparam2: boolean = false\n): Test;`),
      );
    });

    it('should display parameters decorators', () => {
      const sourceFile: SourceFile = project.createSourceFile(
        'code.ts',
        `
				class Test {
					constructor(@Inject() param: string) {}
				}
			`,
      );
      const declaration: ConstructorDeclaration = sourceFile
        .getClassOrThrow('Test')
        .getConstructors()[0];

      expect(constructorPresentation(declaration)).toBe(
        formatCode(`constructor(\n\t@Inject() param: string\n): Test;`),
      );
    });

    it('should display parameters mod', () => {
      const sourceFile: SourceFile = project.createSourceFile(
        'code.ts',
        `
				class Test {
					constructor(readonly param: string) {}
				}
			`,
      );
      const declaration: ConstructorDeclaration = sourceFile
        .getClassOrThrow('Test')
        .getConstructors()[0];

      expect(constructorPresentation(declaration)).toBe(
        formatCode(`constructor(\n\treadonly param: string\n): Test;`),
      );
    });

    it('should display question token for optional parameters', () => {
      const sourceFile: SourceFile = project.createSourceFile(
        'code.ts',
        `
				class Test {
					constructor(param?: string) {}
				}
			`,
      );
      const declaration: ConstructorDeclaration = sourceFile
        .getClassOrThrow('Test')
        .getConstructors()[0];

      expect(constructorPresentation(declaration)).toBe(
        formatCode(`constructor(\n\tparam?: string | undefined\n): Test;`),
      );
    });

    it('should display all possible modifiers together', () => {
      const sourceFile: SourceFile = project.createSourceFile(
        'code.ts',
        `
				class Test {
					constructor(@Inject() private readonly param? = false) {}
				}
			`,
      );
      const declaration: ConstructorDeclaration = sourceFile
        .getClassOrThrow('Test')
        .getConstructors()[0];

      expect(constructorPresentation(declaration)).toBe(
        formatCode(
          `constructor(\n\t@Inject() private readonly param?: boolean | undefined = false\n): Test;`,
        ),
      );
    });
  });

  describe('Accessor', () => {
    describe('Getter', () => {
      it('should display presentation', () => {
        const sourceFile: SourceFile = project.createSourceFile(
          'code.ts',
          `
					class Test {
						get test(): string {
							return 'test';
						}
					}
				`,
        );
        const declaration: GetAccessorDeclaration = sourceFile
          .getClassOrThrow('Test')
          .getGetAccessors()[0];

        expect(accessorPresentation(declaration)).toBe(formatCode(`get test(): string;`));
      });

      it('should display scope', () => {
        const sourceFile: SourceFile = project.createSourceFile(
          'code.ts',
          `
					class Test {
						private get test(): string {
							return 'test';
						}
					}
				`,
        );
        const declaration: GetAccessorDeclaration = sourceFile
          .getClassOrThrow('Test')
          .getGetAccessors()[0];

        expect(accessorPresentation(declaration)).toBe(formatCode(`private get test(): string;`));
      });

      it('should display static', () => {
        const sourceFile: SourceFile = project.createSourceFile(
          'code.ts',
          `
					class Test {
						static get test(): string {
							return 'test';
						}
					}
				`,
        );
        const declaration: GetAccessorDeclaration = sourceFile
          .getClassOrThrow('Test')
          .getGetAccessors()[0];

        expect(accessorPresentation(declaration)).toBe(formatCode(`static get test(): string;`));
      });

      it('should display readonly', () => {
        const sourceFile: SourceFile = project.createSourceFile(
          'code.ts',
          `
					class Test {
						get test(): readonly string[] {
							return ['test'];
						}
					}
				`,
        );
        const declaration: GetAccessorDeclaration = sourceFile
          .getClassOrThrow('Test')
          .getGetAccessors()[0];

        expect(accessorPresentation(declaration)).toBe(
          formatCode(`get test(): readonly string[];`),
        );
      });

      it('should display inherited type', () => {
        const sourceFile: SourceFile = project.createSourceFile(
          'code.ts',
          `
					class Test {
						get test() {
							return 'test';
						}
					}
				`,
        );
        const declaration: GetAccessorDeclaration = sourceFile
          .getClassOrThrow('Test')
          .getGetAccessors()[0];

        expect(accessorPresentation(declaration)).toBe(formatCode(`get test(): string;`));
      });
    });

    describe('Setter', () => {
      it('should display presentation', () => {
        const sourceFile: SourceFile = project.createSourceFile(
          'code.ts',
          `
					class Test {
						set test(value: string) {}
					}
				`,
        );
        const declaration: SetAccessorDeclaration = sourceFile
          .getClassOrThrow('Test')
          .getSetAccessors()[0];

        expect(accessorPresentation(declaration)).toBe(formatCode(`set test(value: string);`));
      });

      it('should display scope', () => {
        const sourceFile: SourceFile = project.createSourceFile(
          'code.ts',
          `
					class Test {
						private set test(value: string) {}
					}
				`,
        );
        const declaration: SetAccessorDeclaration = sourceFile
          .getClassOrThrow('Test')
          .getSetAccessors()[0];

        expect(accessorPresentation(declaration)).toBe(
          formatCode(`private set test(value: string);`),
        );
      });

      it('should display static', () => {
        const sourceFile: SourceFile = project.createSourceFile(
          'code.ts',
          `
					class Test {
						static set test(value: string) {}
					}
				`,
        );
        const declaration: SetAccessorDeclaration = sourceFile
          .getClassOrThrow('Test')
          .getSetAccessors()[0];

        expect(accessorPresentation(declaration)).toBe(
          formatCode(`static set test(value: string);`),
        );
      });

      it('should display inherited type', () => {
        const sourceFile: SourceFile = project.createSourceFile(
          'code.ts',
          `
					class Test {
						set test(value = 'string') {}
					}
				`,
        );
        const declaration: SetAccessorDeclaration = sourceFile
          .getClassOrThrow('Test')
          .getSetAccessors()[0];

        expect(accessorPresentation(declaration)).toBe(
          formatCode(`set test(value: string = 'string');`),
        );
      });
    });
  });

  describe('Method', () => {
    it('should display presentation', () => {
      const sourceFile: SourceFile = project.createSourceFile(
        'code.ts',
        `
				class Test {
					test(param: string) {}
				}
			`,
      );
      const declaration: MethodDeclaration = sourceFile.getClassOrThrow('Test').getMethods()[0];

      expect(methodPresentation(declaration)).toBe(formatCode(`test(param: string): void;`));
    });

    it('should display scope', () => {
      const sourceFile: SourceFile = project.createSourceFile(
        'code.ts',
        `
				class Test {
					private test(param: string) {}
				}
			`,
      );
      const declaration: MethodDeclaration = sourceFile.getClassOrThrow('Test').getMethods()[0];

      expect(methodPresentation(declaration)).toBe(
        formatCode(`private test(param: string): void;`),
      );
    });

    it('should display static', () => {
      const sourceFile: SourceFile = project.createSourceFile(
        'code.ts',
        `
				class Test {
					static test(param: string) {}
				}
			`,
      );
      const declaration: MethodDeclaration = sourceFile.getClassOrThrow('Test').getMethods()[0];

      expect(methodPresentation(declaration)).toBe(formatCode(`static test(param: string): void;`));
    });

    it('should display abstract', () => {
      const sourceFile: SourceFile = project.createSourceFile(
        'code.ts',
        `
				abstract class Test {
					abstract test(param: string): void;
				}
			`,
      );
      const declaration: MethodDeclaration = sourceFile.getClassOrThrow('Test').getMethods()[0];

      expect(methodPresentation(declaration)).toBe(
        formatCode(`abstract test(param: string): void;`),
      );
    });

    it('should display async', () => {
      const sourceFile: SourceFile = project.createSourceFile(
        'code.ts',
        `
				class Test {
					async test(param: string) {}
				}
			`,
      );
      const declaration: MethodDeclaration = sourceFile.getClassOrThrow('Test').getMethods()[0];

      expect(methodPresentation(declaration)).toBe(
        formatCode(`async test(param: string): Promise<void>;`),
      );
    });

    it('should display async and abstract together', () => {
      const sourceFile: SourceFile = project.createSourceFile(
        'code.ts',
        `
				abstract class Test {
					abstract async test(param: string): Promise<void>;
				}
			`,
      );
      const declaration: MethodDeclaration = sourceFile.getClassOrThrow('Test').getMethods()[0];

      expect(methodPresentation(declaration)).toBe(
        formatCode(`abstract async test(param: string): Promise<void>;`),
      );
    });

    it('should display inherited return type', () => {
      const sourceFile: SourceFile = project.createSourceFile(
        'code.ts',
        `
				class Test {
					test() {
						return 'test';
					}
				}
			`,
      );
      const declaration: MethodDeclaration = sourceFile.getClassOrThrow('Test').getMethods()[0];

      expect(methodPresentation(declaration)).toBe(formatCode(`test(): string;`));
    });

    it('should display inherited parameter type', () => {
      const sourceFile: SourceFile = project.createSourceFile(
        'code.ts',
        `
				class Test {
					test(param = 'test') {}
				}
			`,
      );
      const declaration: MethodDeclaration = sourceFile.getClassOrThrow('Test').getMethods()[0];

      expect(methodPresentation(declaration)).toBe(
        formatCode(`test(param: string = 'test'): void;`),
      );
    });

    it('should display inherited parameter type with multiple parameters', () => {
      const sourceFile: SourceFile = project.createSourceFile(
        'code.ts',
        `
				class Test {
					test(param = 'test', param2 = 'test') {}
				}
			`,
      );
      const declaration: MethodDeclaration = sourceFile.getClassOrThrow('Test').getMethods()[0];

      expect(methodPresentation(declaration)).toBe(
        formatCode(`test(param: string = 'test', param2: string = 'test'): void;`),
      );
    });

    it('should display decorators of parameters', () => {
      const sourceFile: SourceFile = project.createSourceFile(
        'code.ts',
        `
				class Test {
					test(@Inject() param: string) {}
				}
			`,
      );
      const declaration: MethodDeclaration = sourceFile.getClassOrThrow('Test').getMethods()[0];

      expect(methodPresentation(declaration)).toBe(
        formatCode(`test(@Inject() param: string): void;`),
      );
    });
  });

  describe('Type Alias', () => {
    it('should display presentation', () => {
      const sourceFile: SourceFile = project.createSourceFile(
        'code.ts',
        `
				type Test = string;
			`,
      );
      const declaration: TypeAliasDeclaration = sourceFile.getTypeAliasOrThrow('Test');

      expect(typeAliasPresentation(declaration)).toBe(formatCode(`type Test = string;`));
    });

    it('should not expand type of keyof values', () => {
      const sourceFile: SourceFile = project.createSourceFile(
        'code.ts',
        `
				interface Test {
					test: string;
				}

				type Test = keyof Test;
			`,
      );
      const declaration: TypeAliasDeclaration = sourceFile.getTypeAliasOrThrow('Test');

      expect(typeAliasPresentation(declaration)).toBe(formatCode(`type Test = keyof Test;`));
    });

    it('should display union types', () => {
      const sourceFile: SourceFile = project.createSourceFile(
        'code.ts',
        `
				type Test = string | number;
			`,
      );
      const declaration: TypeAliasDeclaration = sourceFile.getTypeAliasOrThrow('Test');

      expect(typeAliasPresentation(declaration)).toBe(formatCode(`type Test = string | number;`));
    });

    it('should display intersection types', () => {
      const sourceFile: SourceFile = project.createSourceFile(
        'code.ts',
        `
				interface Test1 {}
				interface Test2 {}

				type Test = Test1 & Test2;
			`,
      );
      const declaration: TypeAliasDeclaration = sourceFile.getTypeAliasOrThrow('Test');

      expect(typeAliasPresentation(declaration)).toBe(formatCode(`type Test = Test1 & Test2;`));
    });

    it('should display tuple types', () => {
      const sourceFile: SourceFile = project.createSourceFile(
        'code.ts',
        `
				type Test = [string, number];
			`,
      );
      const declaration: TypeAliasDeclaration = sourceFile.getTypeAliasOrThrow('Test');

      expect(typeAliasPresentation(declaration)).toBe(formatCode(`type Test = [string, number];`));
    });

    it('should not expand simple Assigned type', () => {
      const sourceFile: SourceFile = project.createSourceFile(
        'code.ts',
        `
				type AssignedType = string;

				type Test = AssignedType;
			`,
      );
      const declaration: TypeAliasDeclaration = sourceFile.getTypeAliasOrThrow('Test');

      expect(typeAliasPresentation(declaration)).toBe(formatCode(`type Test = AssignedType;`));
    });

    it('should display Assigned type', () => {
      const sourceFile: SourceFile = project.createSourceFile(
        'code.ts',
        `
				type AssignedType = string | number;

				type Test = AssignedType;
			`,
      );
      const declaration: TypeAliasDeclaration = sourceFile.getTypeAliasOrThrow('Test');

      expect(typeAliasPresentation(declaration)).toBe(formatCode(`type Test = AssignedType;`));
    });
  });

  describe('Variable', () => {
    it('should display presentation', () => {
      const sourceFile: SourceFile = project.createSourceFile(
        'code.ts',
        `
				const test = 'test';
			`,
      );
      const declaration: VariableDeclaration = sourceFile.getVariableDeclarationOrThrow('test');

      expect(variablePresentation(declaration)).toBe(formatCode(`const test: "test";`));
    });

    it('should display presentation with type', () => {
      const sourceFile: SourceFile = project.createSourceFile(
        'code.ts',
        `
				const test: string = 'test';
			`,
      );
      const declaration: VariableDeclaration = sourceFile.getVariableDeclarationOrThrow('test');

      expect(variablePresentation(declaration)).toBe(formatCode(`const test: string;`));
    });

    it('should display let', () => {
      const sourceFile: SourceFile = project.createSourceFile(
        'code.ts',
        `
				let test: string = 'test';
			`,
      );
      const declaration: VariableDeclaration = sourceFile.getVariableDeclarationOrThrow('test');

      expect(variablePresentation(declaration)).toBe(formatCode(`let test: string;`));
    });
  });
});
