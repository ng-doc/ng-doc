import {
	ClassDeclaration,
	InterfaceDeclaration,
	Node,
	PropertyDeclaration,
	PropertySignature,
} from 'ts-morph';

import { forAllClasses } from '../class';
import { forAllInterfaces } from '../interface';

/**
 *
 * @param property
 */
export function getPropertyChain(
	property: PropertyDeclaration | PropertySignature,
): Array<PropertyDeclaration | PropertySignature> {
	const parent: Node | undefined = property.getParent();
	const name: string = property.getName();
	const properties: Array<PropertyDeclaration | PropertySignature> = [];

	if (Node.isClassDeclaration(parent)) {
		forAllClasses(parent, (cls: ClassDeclaration) => {
			const prop: PropertyDeclaration | undefined = cls.getProperty(name);

			if (prop) {
				properties.push(prop);
			}
		});

		// TODO: Add interfaces

	} else if (Node.isInterfaceDeclaration(parent)) {

		forAllInterfaces(parent, (int: InterfaceDeclaration) => {
			const prop: PropertySignature | undefined = int.getProperty(name);

			if (prop) {
				properties.push(prop);
			}
		});

	} else {

		// type aliases etc don't have inheritance, so we just add the property itself
		properties.push(property);

	}

	return properties;
}
