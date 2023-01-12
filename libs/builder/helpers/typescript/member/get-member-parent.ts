import {Node} from 'ts-morph';

import {NgDocMemberType} from './member-type';

/**
 *
 * @param member
 */
export function getMemberParent(member: NgDocMemberType): Node {
	const parent: Node | undefined = member.getParent();

	return Node.isConstructorDeclaration(parent) ? parent.getParent() : parent;
}
