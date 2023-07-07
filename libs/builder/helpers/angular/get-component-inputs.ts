import {ClassDeclaration, PropertyDeclaration} from 'ts-morph';

import {forAllClasses} from '../typescript/class/for-all-classes';

/**
 * Retrieve all existing `@Input` of an Angular component, up through ascendant classes
 *
 * @param cls - ClassDeclaration
 * @param condition - (cls: ClassDeclaration) => boolean
 */
export function getComponentInputs(cls: ClassDeclaration): PropertyDeclaration[] {
	const properties: Map<string, PropertyDeclaration> = new Map();

	forAllClasses(cls, (c: ClassDeclaration) => {
		c.getProperties().forEach((p: PropertyDeclaration) => {
			if (!properties.has(p.getName()) && p.getDecorator('Input')) {
				properties.set(p.getName(), p);
			}
		});
	});

	return Array.from(properties.values());
}
