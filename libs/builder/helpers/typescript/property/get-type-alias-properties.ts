import { asArray } from '@ng-doc/core';
import { TypeAliasDeclaration, PropertySignature, SyntaxKind, TypeNode } from 'ts-morph';

/**
 * Traverse all of the properties of a type alias declaration,
 * returning an array of all of the properties.
 *
 * Specifically, this resolves type alias declarations that resolve to types
 * that are "object-like", including:
 * - IntersectionTypes,
 * - TypeLiterals, and
 * - TypeReferences (which resolve to IntersectionTypes or TypeLiterals)
 */
export function getTypeAliasProperties(ta: TypeAliasDeclaration): PropertySignature[] {

  const properties: Map<string, PropertySignature> = new Map<string, PropertySignature>();

  const signatures: PropertySignature[] = [];

  const getProperties = (typeNode: TypeNode) => {
    if (typeNode.isKind(SyntaxKind.TypeLiteral)) {
      const members = typeNode.getMembers();
      members.forEach((member) => {
        if (member.isKind(SyntaxKind.PropertySignature)) {
          signatures.push(member);
        }
      });
    } else if (typeNode?.isKind(SyntaxKind.IntersectionType)) {
      const types = typeNode.getTypeNodes();
      types.forEach((typ) => {
        getProperties(typ);
      });
    } else if (typeNode.isKind(SyntaxKind.TypeReference)) {
      const symbol = typeNode.getTypeName().getSymbol();
      if (symbol) {
        const declarations = symbol.getDeclarations();
        declarations.forEach((decl) => {
          if (decl.isKind(SyntaxKind.TypeLiteral)) {
            getProperties(decl);
          } else if (decl.isKind(SyntaxKind.TypeAliasDeclaration)) {
            const typeNode = decl.getTypeNode();
            if (typeNode) {
              getProperties(typeNode);
            }
          }
        });
      }
    }
  };

  const typeNode = ta.getTypeNode();
  if (typeNode) {
    getProperties(typeNode);
  }

  signatures.forEach((property: PropertySignature) => {
    const name: string = property.getName();

    // this may override the previous value (and we want the last one)
    properties.set(name, property);
  });

  return asArray(properties.values());
}
