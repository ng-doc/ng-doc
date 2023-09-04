import { asArray } from '@ng-doc/core';
import {
	AccessorDeclaration,
	GetAccessorDeclaration,
	InterfaceDeclaration,
	Node,
	SetAccessorDeclaration,
} from 'ts-morph';

import { forAllInterfaces } from '../interface';

/**
 *
 * @param int
 */
export function getInterfaceAccessors(int: InterfaceDeclaration): AccessorDeclaration[] {
	const accessors: Map<string, AccessorDeclaration> = new Map<string, AccessorDeclaration>();

	forAllInterfaces(int, (i: InterfaceDeclaration) => {
		const getters: GetAccessorDeclaration[] = i
			.getMembers()
			.filter(Node.isGetAccessorDeclaration) as unknown as GetAccessorDeclaration[];

		const setters: SetAccessorDeclaration[] = i
			.getMembers()
			.filter(Node.isSetAccessorDeclaration) as unknown as SetAccessorDeclaration[];

		getters.forEach((getter: GetAccessorDeclaration) => {
			const name: string = getter.getName();

			if (!accessors.get(`get${name}`)) {
				accessors.set(`get${name}`, getter);
			}
		});

		setters.forEach((setter: SetAccessorDeclaration) => {
			const name: string = setter.getName();

			if (!accessors.get(`set${name}`)) {
				accessors.set(`set${name}`, setter);
			}
		});
	});

	return asArray(accessors.values());
}
