import {ClassDeclaration, Project, PropertyDeclaration, SourceFile} from 'ts-morph';

import {getComponentInputs} from '../angular/get-component-inputs';
import {createProject} from '../typescript/create-project';

describe('getComponentInputs', () => {
	let fixture: Fixture;

	beforeEach(() => {
		fixture = createFixture();
	});

	describe('Given component has no parent class', () => {
		it('retrieves component inputs', () => {
			fixture.givenComponentHasNoParentClass();
			fixture.whenFindingComponentInputs('Test');

			const expectedTestView = [
				{
					propertyName: 'myTestProperty',
					initializer: "'abcd'",
				},
				{
					propertyName: 'myOtherTestProperty',
					initializer: "'abcd'",
				},
			];
			fixture.thenInputsShouldHaveFollowingNamesAndInitializers(expectedTestView);
		});
	});

	describe('Given component has only one parent class', () => {
		it('retrieves component & parent inputs', () => {
			fixture.givenComponentHasOneParentClass();
			fixture.whenFindingComponentInputs('Test2');

			const expectedTestView = [
				{
					initializer: "['azerty', 123, false]",
					propertyName: 'mySecondTestProperty',
				},
				{
					propertyName: 'myThirdTestProperty',
				},
				{
					initializer: "{ name: 'Thomas' }",
					propertyName: 'myFourthTestProperty',
				},
				{
					initializer: "'efgh'",
					propertyName: 'myOtherTestProperty',
				},
				{
					initializer: "'Lorem ipsum'",
					propertyName: 'myFutureOverriddenTestProperty',
				},
				{
					initializer: "'abcd'",
					propertyName: 'myTestProperty',
				},
			];
			fixture.thenInputsShouldHaveFollowingNamesAndInitializers(expectedTestView);
		});
	});

	describe('Given component has only multiple parents classes', () => {
		it('retrieves mid-level component & parent inputs', () => {
			fixture.givenComponentHasMultipleParentsClasses();
			fixture.whenFindingComponentInputs('Test2');

			const expectedTestView = [
				{
					initializer: "['azerty', 123, false]",
					propertyName: 'mySecondTestProperty',
				},
				{
					propertyName: 'myThirdTestProperty',
				},
				{
					initializer: "{ name: 'Thomas' }",
					propertyName: 'myFourthTestProperty',
				},
				{
					initializer: "'efgh'",
					propertyName: 'myOtherTestProperty',
				},
				{
					initializer: "'Lorem ipsum'",
					propertyName: 'myFutureOverriddenTestProperty',
				},
				{
					initializer: "'abcd'",
					propertyName: 'myTestProperty',
				},
			];
			fixture.thenInputsShouldHaveFollowingNamesAndInitializers(expectedTestView);
		});

		it('retrieves component & all parents inputs', () => {
			fixture.givenComponentHasMultipleParentsClasses();
			fixture.whenFindingComponentInputs('Test3');

			const expectedTestView = [
				{
					initializer: "'override_with_initial_value'",
					propertyName: 'myThirdTestProperty',
				},
				{
					initializer: "'Overridden Lorem ipsum'",
					propertyName: 'myFutureOverriddenTestProperty',
				},
				{
					initializer: "['azerty', 123, false]",
					propertyName: 'mySecondTestProperty',
				},
				{
					initializer: "{ name: 'Thomas' }",
					propertyName: 'myFourthTestProperty',
				},
				{
					initializer: "'efgh'",
					propertyName: 'myOtherTestProperty',
				},
				{
					initializer: "'abcd'",
					propertyName: 'myTestProperty',
				},
			];
			fixture.thenInputsShouldHaveFollowingNamesAndInitializers(expectedTestView);
		});
	});
});

interface InputsTestView {
	propertyName: string;
	initializer?: undefined | string;
}

const createFixture = () => {
	let sourceFile: SourceFile;
	let componentInputs: PropertyDeclaration[];

	return {
		givenComponentHasNoParentClass() {
			const project: Project = createProject({useInMemoryFileSystem: true});
			sourceFile = project.createSourceFile(
				'class.ts',
				`
				class Test {
					static myStaticProperty = 'a_static_value'

					@Input()
					myTestProperty = 'abcd'

					@Input()
					myOtherTestProperty = 'abcd'

					method(param = 'string'): string {
						return param;
					}
				}
			`,
			);
		},

		givenComponentHasOneParentClass() {
			const project: Project = createProject({useInMemoryFileSystem: true});
			sourceFile = project.createSourceFile(
				'class.ts',
				`
				class Test {
					static myStaticProperty = 'a_static_value'

					@Input()
					myTestProperty = 'abcd'

					@Input()
					myOtherTestProperty = 'abcd'

					method(param = 'string'): string {
						return param;
					}
				}

				/**
				 * Test2
				*/
				class Test2 extends Test {
					@Input() mySecondTestProperty = ['azerty', 123, false]

					@Input()
					myThirdTestProperty: string;

					@Input()
					myFourthTestProperty = { name: 'Thomas' }

					notAnAngularInput = 'test'

					@Input()
					override myOtherTestProperty = 'efgh'

					@Input()
					myFutureOverriddenTestProperty = 'Lorem ipsum';
				}
			`,
			);
		},

		givenComponentHasMultipleParentsClasses() {
			const project: Project = createProject({useInMemoryFileSystem: true});
			sourceFile = project.createSourceFile(
				'class.ts',
				`
				class Test {
					static myStaticProperty = 'a_static_value'

					@Input()
					myTestProperty = 'abcd'

					@Input()
					myOtherTestProperty = 'abcd'

					method(param = 'string'): string {
						return param;
					}
				}

				/**
				 * Test2
				*/
				class Test2 extends Test {
					@Input() mySecondTestProperty = ['azerty', 123, false]

					@Input()
					myThirdTestProperty: string;

					@Input()
					myFourthTestProperty = { name: 'Thomas' }

					notAnAngularInput = 'test'

					@Input()
					override myOtherTestProperty = 'efgh'

					@Input()
					myFutureOverriddenTestProperty = 'Lorem ipsum';
				}

				/**
				 * Test3
				*/
				class Test3 extends Test2 {
					@Input()
					myThirdTestProperty = 'override_with_initial_value';

					@Input()
					override myFutureOverriddenTestProperty = 'Overridden Lorem ipsum';
				}
			`,
			);
		},

		whenFindingComponentInputs(componentClassName: string) {
			const childClass = sourceFile.getClass(componentClassName) as ClassDeclaration;
			componentInputs = getComponentInputs(childClass);
		},

		thenInputsShouldHaveFollowingNamesAndInitializers(expectedTestView: InputsTestView[]) {
			const realTestView: InputsTestView[] = componentInputs.map((p) => ({
				propertyName: p.getName(),
				initializer: p.getInitializer()?.getText(),
			}));
			expect(realTestView).toEqual(expectedTestView);
		},
	};
};

type Fixture = ReturnType<typeof createFixture>;
