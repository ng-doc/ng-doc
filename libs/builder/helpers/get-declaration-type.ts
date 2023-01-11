import {NgDocDeclarations, NgDocDeclarationType} from '@ng-doc/core';
import {Node} from 'ts-morph';

/**
 *
 * @param node
 */
export function getDeclarationType(node: Node): NgDocDeclarationType | undefined {
	for (const declaration of NgDocDeclarations) {
		if (node?.getKindName().includes(declaration)) {
			return declaration;
		}
	}

	return undefined;
}
