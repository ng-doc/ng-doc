import { asArray } from '@ng-doc/core';
import { ClassDeclaration, MethodDeclaration } from 'ts-morph';

import { forAllClasses } from '../class';

/**
 *
 * @param cls
 */
export function getClassMethods(cls: ClassDeclaration): MethodDeclaration[] {
	const methods: Map<string, MethodDeclaration> = new Map<string, MethodDeclaration>();

	forAllClasses(cls, (baseClass: ClassDeclaration) => {
		baseClass.getMethods().forEach((method: MethodDeclaration) => {
			const name: string = method.getName();

			if (
				!methods.get(name) &&
				(!method.isAbstract() || (method.isAbstract() && cls === baseClass))
			) {
				methods.set(name, method);
			}
		});
	});

	return asArray(methods.values());
}
