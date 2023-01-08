import {isPresent} from '@ng-doc/core';
import {
	ClassDeclaration,
	ExpressionWithTypeArguments,
	InterfaceDeclaration,
	Node,
	PropertyDeclaration,
	PropertySignature,
} from 'ts-morph';

import {findBaseClass, findClass} from '../class';
import {findInterface} from '../interface/find-interface';

/**
 *	Returns property that was implemented by the provided one
 *
 * @param property - Target property
 */
export function getImplementedProperty(
	property: PropertyDeclaration | PropertySignature,
): PropertyDeclaration | PropertySignature | undefined {
	const parent: Node | undefined = property.getParent();
	const name: string = property.getName();

	if (Node.isClassDeclaration(parent)) {
		const prop: PropertyDeclaration | undefined = findBaseClass(
			parent,
			(cls: ClassDeclaration) => !!cls.getProperty(name),
		)?.getProperty(name);

		if (prop?.isAbstract) {
			return prop;
		}

		const nodes: Node[] = parent
			.getImplements()
			.map((expr: ExpressionWithTypeArguments) => expr.getType().getSymbol()?.getDeclarations()[0])
			.filter(isPresent)
			// Reverse implements because the latest one overrides previous one
			.reverse();

		for (const node of nodes) {
			if (Node.isClassDeclaration(node)) {
				const prop: PropertyDeclaration | undefined = findClass(
					node,
					(cls: ClassDeclaration) => !!cls.getProperty(name),
				)?.getProperty(name);

				if (prop?.isAbstract) {
					return prop;
				}
			}

			if (Node.isInterfaceDeclaration(node)) {
				const prop: PropertySignature | undefined = findInterface(
					node,
					(int: InterfaceDeclaration) => !!int.getProperty(name),
				)?.getProperty(name);

				if (prop) {
					return prop;
				}
			}
		}
	}

	return undefined;
}
