import {
	ClassDeclaration,
	InterfaceDeclaration,
	MethodDeclaration,
	Node,
	PropertyDeclaration,
	PropertySignature,
} from 'ts-morph';

import {findBaseClass} from '../class';
import {findInterface} from '../interface';

/**
 *	Returns property that was overridden by the provided one
 *
 * @param property - Target method
 */
export function getOverriddenProperty(
	property: PropertyDeclaration | PropertySignature,
): PropertyDeclaration | PropertySignature | undefined {
	const parent: Node | undefined = property.getParent();
	const name: string = property.getName();

	if (Node.isClassDeclaration(parent)) {
		return findBaseClass(parent, (cls: ClassDeclaration) => {
			const prop: PropertyDeclaration | undefined = cls.getProperty(name);

			return !!prop && !prop.isAbstract();
		})?.getProperty(name);
	}

	if (Node.isInterfaceDeclaration(parent)) {
		return findInterface(
			parent,
			(int: InterfaceDeclaration) => int !== parent && !!int.getProperty(name),
		)?.getProperty(name);
	}

	return undefined;
}
