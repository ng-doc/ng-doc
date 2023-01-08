import {isPresent} from '@ng-doc/core';
import {
	ClassDeclaration,
	ExpressionWithTypeArguments,
	InterfaceDeclaration,
	MethodDeclaration,
	MethodSignature,
	Node,
} from 'ts-morph';

import {findBaseClass, findClass} from '../class';
import {findInterface} from '../interface/find-interface';

/**
 *	Returns method that was implemented by the provided one
 *
 * @param method - Target method
 */
export function getImplementedMethod(
	method: MethodDeclaration | MethodSignature,
): MethodDeclaration | MethodSignature | undefined {
	const parent: Node | undefined = method.getParent();
	const name: string = method.getName();

	if (Node.isClassDeclaration(parent)) {
		const mtd: MethodDeclaration | undefined = findBaseClass(
			parent,
			(cls: ClassDeclaration) => !!cls.getMethod(name),
		)?.getMethod(name);

		if (mtd?.isAbstract) {
			return mtd;
		}

		const nodes: Node[] = parent
			.getImplements()
			.map((expr: ExpressionWithTypeArguments) => expr.getType().getSymbol()?.getDeclarations()[0])
			.filter(isPresent)
			// Reverse implements because the latest one overrides previous one
			.reverse();

		for (const node of nodes) {
			if (Node.isClassDeclaration(node)) {
				const mtd: MethodDeclaration | undefined = findClass(
					node,
					(cls: ClassDeclaration) => !!cls.getMethod(name),
				)?.getMethod(name);

				if (mtd?.isAbstract) {
					return mtd;
				}
			}

			if (Node.isInterfaceDeclaration(node)) {
				const mtd: MethodSignature | undefined = findInterface(
					node,
					(int: InterfaceDeclaration) => !!int.getMethod(name),
				)?.getMethod(name);

				if (mtd) {
					return mtd;
				}
			}
		}
	}

	return undefined;
}
