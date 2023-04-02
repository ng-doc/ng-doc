import {ClassDeclaration, Project, SourceFile} from 'ts-morph';

import {createProject} from '../create-project';
import {displayReturnType, displayType} from '../display-type';

describe('displayType', () => {
	let project: Project;

	beforeEach(() => {
		project = createProject({
			useInMemoryFileSystem: true,
			compilerOptions: {
				strict: true,
			},
		});
	});

	describe('Class', () => {
		describe('Property', () => {
			it('should return the type of a property', () => {
				const sourceFile: SourceFile = project.createSourceFile(
					'class.ts',
					`
				class Test {
					property: string;
				}
			`,
				);
				const declaration: ClassDeclaration = sourceFile.getClassOrThrow('Test');

				expect(displayType(declaration.getPropertyOrThrow('property'))).toBe(`string`);
			});

			it('should return the inferred type of a property', () => {
				const sourceFile: SourceFile = project.createSourceFile(
					'class.ts',
					`
				class Test {
					property = 'string';
				}
			`,
				);
				const declaration: ClassDeclaration = sourceFile.getClassOrThrow('Test');

				expect(displayType(declaration.getPropertyOrThrow('property'))).toBe(`string`);
			});

			it('should return the expanded type for simple TypeAlias type', () => {
				const sourceFile: SourceFile = project.createSourceFile(
					'class.ts',
					`
				type TestType = string;

				class Test {
					property: TestType;
				}
			`,
				);
				const declaration: ClassDeclaration = sourceFile.getClassOrThrow('Test');

				expect(displayType(declaration.getPropertyOrThrow('property'))).toBe(`string`);
			});

			it('should return the TypeAlias name type of a property', () => {
				const sourceFile: SourceFile = project.createSourceFile(
					'class.ts',
					`
				type TestType = string | number;

				class Test {
					property: TestType;
				}
			`,
				);
				const declaration: ClassDeclaration = sourceFile.getClassOrThrow('Test');

				expect(displayType(declaration.getPropertyOrThrow('property'))).toBe(`TestType`);
			});

			it('should return the TypeAlias name of a property for union type', () => {
				const sourceFile: SourceFile = project.createSourceFile(
					'class.ts',
					`
				type TestType = 'value1' | 'value2';

				class Test {
					property: TestType;
				}
			`,
				);
				const declaration: ClassDeclaration = sourceFile.getClassOrThrow('Test');

				expect(displayType(declaration.getPropertyOrThrow('property'))).toBe(`TestType`);
			});

			it('should return the type of a optional property', () => {
				const sourceFile: SourceFile = project.createSourceFile(
					'class.ts',
					`
				class Test {
					property?: string;
				}
			`,
				);
				const declaration: ClassDeclaration = sourceFile.getClassOrThrow('Test');

				expect(displayType(declaration.getPropertyOrThrow('property'))).toBe(`string | undefined`);
			});

			it('should return the type of a property with default value', () => {
				const sourceFile: SourceFile = project.createSourceFile(
					'class.ts',
					`
				class Test {
					property = 'string';
				}
			`,
				);
				const declaration: ClassDeclaration = sourceFile.getClassOrThrow('Test');

				expect(displayType(declaration.getPropertyOrThrow('property'))).toBe(`string`);
			});

			it('should return the type of a property with default value and type', () => {
				const sourceFile: SourceFile = project.createSourceFile(
					'class.ts',
					`
				class Test {
					property: string = 'string';
				}
			`,
				);
				const declaration: ClassDeclaration = sourceFile.getClassOrThrow('Test');

				expect(displayType(declaration.getPropertyOrThrow('property'))).toBe(`string`);
			});
		});

		describe('Method', () => {
			it('should return the type of a method', () => {
				const sourceFile: SourceFile = project.createSourceFile(
					'class.ts',
					`
				class Test {
					method(): string {
						return 'string';
					}
				}
			`,
				);
				const declaration: ClassDeclaration = sourceFile.getClassOrThrow('Test');

				expect(displayReturnType(declaration.getMethodOrThrow('method'))).toBe(`string`);
			});

			it('should return the inferred type of a method', () => {
				const sourceFile: SourceFile = project.createSourceFile(
					'class.ts',
					`
				class Test {
					method() {
						return 'string';
					}
				}
			`,
				);
				const declaration: ClassDeclaration = sourceFile.getClassOrThrow('Test');

				expect(displayReturnType(declaration.getMethodOrThrow('method'))).toBe(`string`);
			});

			it('should return the Alias Type of a method', () => {
				const sourceFile: SourceFile = project.createSourceFile(
					'class.ts',
					`
				type TestType = string;

				class Test {
					method(): TestType {
						return 'string';
					}
				}
			`,
				);
				const declaration: ClassDeclaration = sourceFile.getClassOrThrow('Test');

				expect(displayReturnType(declaration.getMethodOrThrow('method'))).toBe(`string`);
			});

			it('should return the Alias Type of a method for union type', () => {
				const sourceFile: SourceFile = project.createSourceFile(
					'class.ts',
					`
				type TestType = 'value1' | 'value2';

				class Test {
					method(): TestType {
						return 'value1';
					}
				}
			`,
				);
				const declaration: ClassDeclaration = sourceFile.getClassOrThrow('Test');

				expect(displayReturnType(declaration.getMethodOrThrow('method'))).toBe(`TestType`);
			});

			it('should return the type of a parameter', () => {
				const sourceFile: SourceFile = project.createSourceFile(
					'class.ts',
					`
				class Test {
					method(param: string): string {
						return param;
					}
				}
			`,
				);
				const declaration: ClassDeclaration = sourceFile.getClassOrThrow('Test');

				expect(displayType(declaration.getMethodOrThrow('method').getParameterOrThrow('param'))).toBe(`string`);
			})

			it('should return the type of a optional parameter', () => {
				const sourceFile: SourceFile = project.createSourceFile(
					'class.ts',
					`
				class Test {
					method(param?: string): string {
						return param;
					}
				}
			`,
				);
				const declaration: ClassDeclaration = sourceFile.getClassOrThrow('Test');

				expect(displayType(declaration.getMethodOrThrow('method').getParameterOrThrow('param'))).toBe(`string | undefined`);
			})

			it('should return the type of a parameter with default value', () => {
				const sourceFile: SourceFile = project.createSourceFile(
					'class.ts',
					`
				class Test {
					method(param = 'string'): string {
						return param;
					}
				}
			`,
				);
				const declaration: ClassDeclaration = sourceFile.getClassOrThrow('Test');

				expect(displayType(declaration.getMethodOrThrow('method').getParameterOrThrow('param'))).toBe(`string`);
			})
		});

		it('should return type of extended class', () => {
			const sourceFile: SourceFile = project.createSourceFile(
				'class.ts',
				`
				class Test {
					property: string;
				}

				class Test2 extends Test {
				}
			`,
			);
			const declaration: ClassDeclaration = sourceFile.getClassOrThrow('Test2');

			expect(displayType(declaration.getExtends()!)).toBe(`Test`);
		})

		it('should return type of implemented interface', () => {
			const sourceFile: SourceFile = project.createSourceFile(
				'class.ts',
				`
				interface Test {
					property: string;
				}

				class Test2 implements Test {
				}
			`,
			);
			const declaration: ClassDeclaration = sourceFile.getClassOrThrow('Test2');

			expect(displayType(declaration.getImplements()[0])).toBe(`Test`);
		})
	});
});
