import {asArray} from '@ng-doc/core';
import {
	AccessorDeclaration,
	ClassDeclaration,
	GetAccessorDeclaration,
	SetAccessorDeclaration,
} from 'ts-morph';

import {forAllClasses} from '../class';

/**
 *
 * @param cls
 */
export function getClassAccessors(cls: ClassDeclaration): AccessorDeclaration[] {
	const accessors: Map<string, AccessorDeclaration> = new Map<string, AccessorDeclaration>();

	forAllClasses(cls, (baseClass: ClassDeclaration) => {
		baseClass.getGetAccessors().forEach((accessor: GetAccessorDeclaration) => {
			const name: string = accessor.getName();

			if (
				!accessors.get(`get${name}`) &&
				(!accessor.isAbstract() || (accessor.isAbstract() && cls === baseClass))
			) {
				accessors.set(`get${name}`, accessor);
			}
		});

		baseClass.getSetAccessors().forEach((accessor: SetAccessorDeclaration) => {
			const name: string = accessor.getName();

			if (
				!accessors.get(`set${name}`) &&
				(!accessor.isAbstract() || (accessor.isAbstract() && cls === baseClass))
			) {
				accessors.set(`set${name}`, accessor);
			}
		});
	});

	return asArray(accessors.values());
}
