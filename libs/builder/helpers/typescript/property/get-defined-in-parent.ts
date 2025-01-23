import { Node, SyntaxKind } from 'ts-morph';

/**
 * Resolves the parent node (TypeReference or TypeAliasDeclaration name)
 * of a property that is defined in a type alias declaration.
 * 
 * Specifically, this resolves type alias declarations that resolve to types 
 * that are "object-like", including:
 * - IntersectionTypes,
 * - TypeLiterals, and
 * - TypeReferences (which resolve to IntersectionTypes or TypeLiterals)
 * 
 * For other types (e.g. UnionType) it just defaults back to the existing
 * rendering.
 *
 * @param property
 * @param currentNode

 * @note
 * Similar to `getMemberParent` but handling type aliases declarations
 * rather than member inheritance.
 * 
 * @see libs/builder/helpers/typescript/member/get-member-parent.ts
 */
export function getDefinedInParent(property: Node, currentNode: Node): Node | undefined {
  let propertyParent = property.getParent();

  const excludeCurrentNode = (node: Node | undefined) => node === currentNode ? undefined : node;

  if(propertyParent?.isKind(SyntaxKind.TypeLiteral)) {
    return excludeCurrentNode(getDefinedInParent(propertyParent, currentNode) ?? propertyParent);
  }

  if(propertyParent?.isKind(SyntaxKind.IntersectionType)) {
    return excludeCurrentNode(getDefinedInParent(propertyParent, currentNode) ?? propertyParent);
  }

  return excludeCurrentNode(propertyParent);
}
