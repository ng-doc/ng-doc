import { asArray } from '@ng-doc/core';
import { AccessorDeclaration, Node } from 'ts-morph';

import { NgDocAccessor } from './accessor';

/**
 *
 * @param accessors
 */
export function groupAccessors(accessors: AccessorDeclaration[]): NgDocAccessor[] {
	const map: Map<string, NgDocAccessor> = new Map<string, NgDocAccessor>();

	accessors.forEach((accessor: AccessorDeclaration) => {
		if (Node.isGetAccessorDeclaration(accessor)) {
			map.set(accessor.getName(), { ...map.get(accessor.getName()), get: accessor });
		}

		if (Node.isSetAccessorDeclaration(accessor)) {
			map.set(accessor.getName(), { ...map.get(accessor.getName()), set: accessor });
		}
	});

	return asArray(map.values());
}
