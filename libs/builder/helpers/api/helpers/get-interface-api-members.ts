import {
  InterfaceDeclaration,
  InterfaceDeclarationStructure,
  MethodSignature,
  MethodSignatureStructure,
  OptionalKind,
  PropertySignature,
  PropertySignatureStructure,
} from 'ts-morph';

import {
  firstNodeWithComment,
  forAllInterfaces,
  getMemberChain,
  isClassMember,
} from '../../typescript';
import { ApiMember } from '../types';

export type InterfaceApiMember = OptionalKind<
  MethodSignatureStructure | PropertySignatureStructure
>;

type InferDeclaration<T extends InterfaceApiMember> =
  T extends OptionalKind<MethodSignatureStructure>
    ? MethodSignature
    : T extends OptionalKind<PropertySignatureStructure>
      ? PropertySignature
      : never;

/**
 *
 * @param declaration
 * @param get
 * @param mapper
 * @param memberKey
 */
export function getInterfaceApiMembers<T extends InterfaceApiMember, R>(
  declaration: InterfaceDeclaration,
  get: (structure: InterfaceDeclarationStructure) => T[],
  mapper: (members: Map<string, ApiMember<T, InferDeclaration<T>>>) => R[],
  memberKey: (member: T) => string = (member) => member.name,
): R[] {
  const members = new Map<string, ApiMember<T, InferDeclaration<T>>>();

  forAllInterfaces(declaration, (int) => {
    const structure = int.getStructure();
    const intMembers = get(structure);

    intMembers.forEach((member) => {
      const memberDeclaration = getInterfaceMember(int, member.name)!;
      const memberChain =
        memberDeclaration && isClassMember(memberDeclaration)
          ? getMemberChain(memberDeclaration)
          : [];
      const docNode = firstNodeWithComment(memberChain) ?? memberDeclaration;
      const key = memberKey(member);
      const existing = members.get(key);

      if (existing && !existing.parentRelation) {
        if (int !== declaration) {
          existing.parentRelation = {
            parent: int,
            relation: 'overrides',
          };
        }
      }

      if (!existing) {
        if (int !== declaration) {
          members.set(key, {
            structure: member,
            parentRelation: {
              parent: int,
              relation: 'inherited',
            },
            declaration: memberDeclaration as InferDeclaration<T>,
            docNode: docNode.getStructure(),
          });
        } else {
          !members.get(key) &&
            members.set(key, {
              structure: member,
              declaration: memberDeclaration as InferDeclaration<T>,
              docNode: docNode.getStructure(),
            });
        }
      }
    });
  });

  return mapper(members);
}

/**
 *
 * @param declaration
 * @param name
 */
function getInterfaceMember(
  declaration: InterfaceDeclaration,
  name: string,
): MethodSignature | PropertySignature | undefined {
  return declaration.getMethod(name) ?? declaration.getProperty(name);
}
