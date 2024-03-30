import { asArray, isPresent } from '@ng-doc/core';
import {
  ClassDeclaration,
  ClassDeclarationStructure,
  ExpressionWithTypeArguments,
  GetAccessorDeclaration,
  GetAccessorDeclarationStructure,
  MethodDeclaration,
  MethodDeclarationStructure,
  Node,
  OptionalKind,
  PropertyDeclaration,
  PropertyDeclarationStructure,
  SetAccessorDeclaration,
  SetAccessorDeclarationStructure,
} from 'ts-morph';

import {
  ClassMember,
  findMember,
  firstNodeWithComment,
  getMemberChain,
  isClassMember,
} from '../../typescript';
import { forAllClasses } from '../../typescript/class';
import { ApiMember } from '../types';

export type ClassApiMember = OptionalKind<
  | MethodDeclarationStructure
  | PropertyDeclarationStructure
  | GetAccessorDeclarationStructure
  | SetAccessorDeclarationStructure
>;

type InferDeclaration<T extends ClassApiMember> =
  T extends OptionalKind<MethodDeclarationStructure>
    ? MethodDeclaration
    : T extends OptionalKind<PropertyDeclarationStructure>
      ? PropertyDeclaration
      : T extends OptionalKind<GetAccessorDeclarationStructure>
        ? GetAccessorDeclaration
        : T extends OptionalKind<SetAccessorDeclarationStructure>
          ? SetAccessorDeclaration
          : never;
/**
 *
 * @param declaration
 * @param get
 * @param mapper
 * @param memberKey
 */
export function getClassApiMembers<T extends ClassApiMember, R>(
  declaration: ClassDeclaration,
  get: (structure: ClassDeclarationStructure) => T[],
  mapper: (members: Map<string, ApiMember<T, InferDeclaration<T>>>) => R[],
  memberKey: (member: T) => string = (member) => member.name,
): R[] {
  const members = new Map<string, ApiMember<T, InferDeclaration<T>>>();

  forAllClasses(declaration, (cls) => {
    const structure = cls.getStructure();
    const clsMembers = get(structure);
    const curParent = declaration !== cls ? cls : undefined;
    const implementsNodes = curParent
      ?.getImplements()
      .map((expr: ExpressionWithTypeArguments) => expr.getType().getSymbol()?.getDeclarations()[0])
      .filter(isPresent)
      // Reverse implements because the latest one overrides previous one
      .reverse();

    clsMembers.forEach((clsMember) => {
      const memberDeclaration = cls.getMember(clsMember.name)!;
      const memberChain =
        memberDeclaration && isClassMember(memberDeclaration)
          ? getMemberChain(memberDeclaration)
          : [];
      const docNode = firstNodeWithComment(memberChain) ?? memberDeclaration;
      const key = memberKey(clsMember);
      const existing = members.get(key);

      if (existing && !existing.parentRelation) {
        if (cls !== declaration) {
          if (!existing.structure.isAbstract && clsMember.isAbstract) {
            existing.parentRelation = {
              parent: cls,
              relation: 'implements',
            };
          } else {
            existing.parentRelation = {
              parent: cls,
              relation: 'overrides',
            };
          }
        }
      }

      if (!existing) {
        if (cls !== declaration) {
          members.set(key, {
            declaration: memberDeclaration as InferDeclaration<T>,
            structure: clsMember,
            parentRelation: {
              parent: cls,
              relation: 'inherited',
            },
            docNode: docNode.getStructure(),
          });
        } else {
          for (const node of asArray(implementsNodes)) {
            if (Node.isClassDeclaration(node)) {
              const m: ClassMember | undefined = findMember(node, clsMember.name);

              if (Node.isAbstractable(m) && m.isAbstract()) {
                members.set(key, {
                  declaration: memberDeclaration as InferDeclaration<T>,
                  structure: clsMember,
                  parentRelation: {
                    parent: node,
                    relation: 'implements',
                  },
                  docNode: docNode.getStructure(),
                });
              }
            }

            if (Node.isInterfaceDeclaration(node)) {
              if (findMember(node, clsMember.name)) {
                members.set(key, {
                  declaration: memberDeclaration as InferDeclaration<T>,
                  structure: clsMember,
                  parentRelation: {
                    parent: node,
                    relation: 'implements',
                  },
                  docNode: docNode.getStructure(),
                });
              }
            }
          }

          !members.get(key) &&
            members.set(key, {
              declaration: memberDeclaration as InferDeclaration<T>,
              structure: clsMember,
              docNode: docNode.getStructure(),
            });
        }
      }
    });
  });

  return mapper(members);
}
