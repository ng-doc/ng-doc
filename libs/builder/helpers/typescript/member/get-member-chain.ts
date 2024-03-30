import { ClassDeclaration, InterfaceDeclaration, Node } from 'ts-morph';

import { forAllClasses } from '../class';
import { forAllInterfaces } from '../interface/for-all-interfaces';
import { ClassMember, InterfaceMember, isClassMember } from './member-type';

/**
 *
 * @param member
 */
export function getMemberChain(
  member: ClassMember | InterfaceMember,
): Array<ClassMember | InterfaceMember> {
  const parent: Node | undefined = member.getParent();
  const members: Array<ClassMember | InterfaceMember> = [];

  if (Node.isClassDeclaration(parent)) {
    forAllClasses(parent, (cls: ClassDeclaration) => {
      const m = cls.getMember(member.getName());

      if (m && isClassMember(m)) {
        members.push(m);
      }
    });
  }

  if (Node.isInterfaceDeclaration(parent)) {
    forAllInterfaces(parent, (int: InterfaceDeclaration) => {
      const m = int.getMethod(member.getName());

      if (m) {
        members.push(m);
      }
    });
  }

  return members;
}
