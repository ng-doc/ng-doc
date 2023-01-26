import {ClassDeclaration, InterfaceDeclaration, MethodDeclaration, MethodSignature, Node} from 'ts-morph';

import {forAllClasses} from '../class';
import {forAllInterfaces} from '../interface/for-all-interfaces';

/**
 *
 * @param method
 */
export function getMethodChain(method: MethodDeclaration): Array<MethodDeclaration | MethodSignature> {
	const parent: Node | undefined = method.getParent();
	const methods: Array<MethodDeclaration | MethodSignature> = [];

	if (Node.isClassDeclaration(parent)) {
		forAllClasses(parent, (cls: ClassDeclaration) => {
			const mtd: MethodDeclaration | undefined = cls.getMethod(method.getName());

			if (mtd) {
				methods.push(mtd);
			}
		});

		// TODO: Add interfaces
	}

	if (Node.isInterfaceDeclaration(parent)) {
		forAllInterfaces(parent, (int: InterfaceDeclaration) => {
			const mtd: MethodSignature | undefined = int.getMethod(method.getName());

			if (mtd) {
				methods.push(mtd);
			}
		});
	}

	return methods;
}
