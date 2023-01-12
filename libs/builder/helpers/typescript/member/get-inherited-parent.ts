import {Node} from 'ts-morph';

import {getMemberParent, NgDocMemberType} from '../index';

/**
 *
 * @param member
 * @param currentNode
 */
export function getInheritedParent(member: NgDocMemberType, currentNode: Node): Node | undefined {
	const memberParent: Node = getMemberParent(member);

	if (Node.isConstructorDeclaration(currentNode)) {
		currentNode = currentNode.getParent();
	}

	return memberParent === currentNode ? undefined : memberParent;
}
