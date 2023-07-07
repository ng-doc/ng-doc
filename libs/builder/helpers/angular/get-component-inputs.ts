import {ClassDeclaration, PropertyDeclaration} from 'ts-morph';

import {forAllClasses} from '../typescript/class/for-all-classes';

/**
 * Retrieve all existing `@Input` of an Angular component, up through ascendant classes
 *
 * @param cls - ClassDeclaration
 * @param condition - (cls: ClassDeclaration) => boolean
 */
export function getComponentInputs(
	cls: ClassDeclaration,
	condition: (cls: ClassDeclaration) => boolean = classHasNoParent,
): PropertyDeclaration[] {
	const allComponentAndParentsInputs: PropertyDeclaration[][] = [];

	forAllClasses(cls, (c: ClassDeclaration) => {
		const isBaseClass = c !== cls && condition(c);
		allComponentAndParentsInputs.push(getComponentInputsProperties(c.getProperties()));
		return isBaseClass;
	});

	return withoutOverriddenInputs(allComponentAndParentsInputs)
}

/**
 * Keep only Angular `@Input` properties
 *
 * @param properties - PropertyDeclaration[]
 */
function getComponentInputsProperties(properties: PropertyDeclaration[]) {
	return properties.filter((property: PropertyDeclaration) => !!property.getDecorator('Input'));
}

/**
 * Removes parent class' properties if they have been overridden by a descendant class
 *
 * @param properties - PropertyDeclaration[][]
 */
function withoutOverriddenInputs(properties: PropertyDeclaration[][]) {
	return properties.flat(1).reduce((acc, curr) => {
		const propertyAlreadyExists = acc.find((p) => p.getName() === curr.getName());
		if (propertyAlreadyExists) {
			return acc;
		}
		return [...acc, curr];
	}, [] as PropertyDeclaration[]);
}

/**
 * @param cls - ClassDeclaration
 */
function classHasNoParent (cls: ClassDeclaration) {
	return cls.getBaseClass() === undefined || cls.isAbstract()
}
