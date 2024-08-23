import { ClassDeclaration, InterfaceDeclaration, Node } from 'ts-morph';

import { findClass } from '../class';
import { findInterface } from '../interface';
import { getInterfaceMember } from '../interface/get-interface-member';
import { ClassMember, InterfaceMember, isClassMember, MemberType } from './member-type';

export function findMember(node: ClassDeclaration, name: string): ClassMember | undefined;
export function findMember(node: InterfaceDeclaration, name: string): InterfaceMember | undefined;
/**
 *
 * @param node
 * @param name
 */
export function findMember(
  node: ClassDeclaration | InterfaceDeclaration,
  name: string,
): MemberType | undefined {
  if (Node.isClassDeclaration(node)) {
    const member = findClass(
      node,
      (cls: ClassDeclaration) => !!cls.getInstanceMember(name),
    )?.getInstanceMember(name);

    return member && isClassMember(member) ? member : undefined;
  }

  if (Node.isInterfaceDeclaration(node)) {
    if (Node.isInterfaceDeclaration(node)) {
      const baseInterface: InterfaceDeclaration | undefined = findInterface(
        node,
        (int: InterfaceDeclaration) => !!getInterfaceMember(int, name),
      );

      return baseInterface && getInterfaceMember(baseInterface, name);
    }
  }

  return undefined;
}
