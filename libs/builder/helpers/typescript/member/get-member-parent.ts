import { Node } from 'ts-morph';

import { MemberType } from './member-type';

/**
 *
 * @param member
 */
export function getMemberParent(member: MemberType): Node {
  const parent: Node | undefined = member.getParent();

  return Node.isConstructorDeclaration(parent) ? parent.getParent() : parent;
}
