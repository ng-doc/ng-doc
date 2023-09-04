import {
	AccessorDeclaration,
	ClassDeclaration,
	GetAccessorDeclaration,
	InterfaceDeclaration,
	Node,
	SetAccessorDeclaration,
} from 'ts-morph';

import { forAllClasses } from '../class';
import { forAllInterfaces } from '../interface/for-all-interfaces';
import { getInterfaceAccessors } from './get-interface-accessors';

/**
 *
 * @param accessor
 */
export function getAccessorChain(accessor: GetAccessorDeclaration): GetAccessorDeclaration[];
export function getAccessorChain(accessor: SetAccessorDeclaration): SetAccessorDeclaration[];
/**
 *
 * @param accessor
 */
export function getAccessorChain(accessor: AccessorDeclaration): AccessorDeclaration[] {
	const parent: Node | undefined = accessor.getParent();
	const accessors: AccessorDeclaration[] = [];
	const name: string = accessor.getName();

	if (Node.isClassDeclaration(parent)) {
		forAllClasses(parent, (cls: ClassDeclaration) => {
			if (Node.isGetAccessorDeclaration(accessor)) {
				const getter: GetAccessorDeclaration | undefined = cls.getGetAccessor(name);

				if (getter) {
					accessors.push(getter);
				}
			}

			if (Node.isSetAccessorDeclaration(accessor)) {
				const setter: SetAccessorDeclaration | undefined = cls.getSetAccessor(name);

				if (setter) {
					accessors.push(setter);
				}
			}
		});

		// TODO: Add interfaces
	}

	if (Node.isInterfaceDeclaration(parent)) {
		forAllInterfaces(parent, (int: InterfaceDeclaration) => {
			getInterfaceAccessors(int)
				.filter((acc: AccessorDeclaration) => acc.getName() === name)
				.forEach((acc: AccessorDeclaration) => {
					if (Node.isGetAccessorDeclaration(accessor) && Node.isGetAccessorDeclaration(acc)) {
						accessors.push(acc);
					}

					if (Node.isSetAccessorDeclaration(accessor) && Node.isSetAccessorDeclaration(acc)) {
						accessors.push(acc);
					}
				});
		});
	}

	return accessors;
}
