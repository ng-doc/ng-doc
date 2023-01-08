import {ClassDeclaration, InterfaceDeclaration, MethodDeclaration, MethodSignature, Node} from 'ts-morph';

import {findBaseClass} from '../class';
import {findInterface} from '../interface';

/**
 *	Returns method that was overridden by the provided one
 *
 * @param method - Target method
 */
export function getOverriddenMethod(
	method: MethodDeclaration | MethodSignature,
): MethodDeclaration | MethodSignature | undefined {
	const parent: Node | undefined = method.getParent();
	const name: string = method.getName();

	if (Node.isClassDeclaration(parent)) {
		return findBaseClass(parent, (cls: ClassDeclaration) => {
			const mtd: MethodDeclaration | undefined = cls.getMethod(name);

			return !!mtd && !mtd.isAbstract();
		})?.getMethod(name);
	}

	if (Node.isInterfaceDeclaration(parent)) {
		return findInterface(parent, (int: InterfaceDeclaration) => int !== parent && !!int.getMethod(name))?.getMethod(
			name,
		);
	}

	return undefined;
}
