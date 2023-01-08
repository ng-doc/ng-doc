import {asArray} from '@ng-doc/core';
import {InterfaceDeclaration, MethodSignature} from 'ts-morph';

import {forAllInterfaces} from '../interface';

/**
 *
 * @param int
 */
export function getInterfaceMethods(int: InterfaceDeclaration): MethodSignature[] {
	const methods: Map<string, MethodSignature> = new Map<string, MethodSignature>();

	forAllInterfaces(int, (i: InterfaceDeclaration) => {
		i.getMethods().forEach((method: MethodSignature) => {
			const name: string = method.getName();

			if (!methods.get(name)) {
				methods.set(name, method);
			}
		});
	});

	return asArray(methods.values());
}
