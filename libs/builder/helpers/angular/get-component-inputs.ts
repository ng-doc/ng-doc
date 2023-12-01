import {
	ClassDeclaration,
	GetAccessorDeclaration,
	PropertyDeclaration,
	SetAccessorDeclaration,
} from 'ts-morph';

import { forAllClasses } from '../typescript/class/for-all-classes';

export type NgDocInputDeclaration =
	| PropertyDeclaration
	| GetAccessorDeclaration
	| SetAccessorDeclaration;

/**
 * Retrieve all existing `@Input` of an Angular component, up through ascendant classes
 * @param cls - ClassDeclaration
 * @param condition - (cls: ClassDeclaration) => boolean
 */
export function getComponentInputs(cls: ClassDeclaration): NgDocInputDeclaration[] {
	const properties: Map<string, NgDocInputDeclaration> = new Map();

	forAllClasses(cls, (c: ClassDeclaration) => {
		c.getProperties().forEach((p: PropertyDeclaration) => {
			if (!properties.has(p.getName()) && p.getDecorator('Input')) {
				properties.set(p.getName(), p);
			}
		});

		c.getGetAccessors().forEach((p: GetAccessorDeclaration) => {
			if (!properties.has(p.getName()) && p.getDecorator('Input')) {
				properties.set(p.getName(), p);
			}
		});

		c.getSetAccessors().forEach((p: SetAccessorDeclaration) => {
			if (!properties.has(p.getName()) && p.getDecorator('Input')) {
				properties.set(p.getName(), p);
			}
		});
	});

	return Array.from(properties.values());
}
