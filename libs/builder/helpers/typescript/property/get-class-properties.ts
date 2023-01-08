import {asArray} from '@ng-doc/core';
import {ClassDeclaration, PropertyDeclaration} from 'ts-morph';

import {forAllClasses} from '../class';

/**
 *
 * @param cls
 */
export function getClassProperties(cls: ClassDeclaration): PropertyDeclaration[] {
	const properties: Map<string, PropertyDeclaration> = new Map<string, PropertyDeclaration>();

	forAllClasses(cls, (baseClass: ClassDeclaration) => {
		baseClass.getProperties().forEach((property: PropertyDeclaration) => {
			const name: string = property.getName();

			if (!properties.get(name) && (!property.isAbstract() || (property.isAbstract() && cls === baseClass))) {
				properties.set(name, property);
			}
		});
	});

	return asArray(properties.values());
}
