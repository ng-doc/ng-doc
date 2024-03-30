import {
  CallSignatureDeclaration,
  ClassPropertyTypes,
  ConstructSignatureDeclaration,
  IndexSignatureDeclaration,
  MethodDeclaration,
  Node,
  TypeElementTypes,
} from 'ts-morph';

export type ClassMember = MethodDeclaration | ClassPropertyTypes;
export type InterfaceMember = Exclude<
  TypeElementTypes,
  ConstructSignatureDeclaration | CallSignatureDeclaration | IndexSignatureDeclaration
>;
export type MemberType = ClassMember | InterfaceMember;

/**
 *
 * @param member
 */
export function isClassMember(member: Node): member is ClassMember {
  return (
    Node.isMethodDeclaration(member) ||
    Node.isPropertyDeclaration(member) ||
    Node.isGetAccessorDeclaration(member) ||
    Node.isSetAccessorDeclaration(member)
  );
}

/**
 *
 * @param member
 */
export function isInterfaceMember(member: Node): member is InterfaceMember {
  return Node.isMethodSignature(member) || Node.isPropertySignature(member);
}
