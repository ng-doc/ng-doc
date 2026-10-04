import { Node } from 'ts-morph';

import { getMemberParent } from './get-member-parent';
import type { MemberType } from './member-type';

/**
 *
 * @param member
 * @param currentNode
 */
export function getInheritedParent(member: MemberType, currentNode: Node): Node | undefined {
  const memberParent: Node = getMemberParent(member);

  if (Node.isConstructorDeclaration(currentNode)) {
    currentNode = currentNode.getParent();
  }

  return memberParent === currentNode ? undefined : memberParent;
}
