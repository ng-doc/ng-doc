import { InterfaceDeclaration, Node, TypeElementTypes } from 'ts-morph';

import { InterfaceMember } from '../member/member-type';

/**
 *
 * @param int
 * @param name
 */
export function getInterfaceMember(
  int: InterfaceDeclaration,
  name: string,
): InterfaceMember | undefined {
  return (
    int
      .getMembers()
      .filter(
        (m: TypeElementTypes) =>
          !Node.isConstructSignatureDeclaration(m) &&
          !Node.isCallSignatureDeclaration(m) &&
          !Node.isIndexSignatureDeclaration(m),
      ) as InterfaceMember[]
  ).find((m: InterfaceMember) => m.getName() === name);
}
