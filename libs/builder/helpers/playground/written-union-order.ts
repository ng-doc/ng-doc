import { Node, ts, Type, TypeNode } from 'ts-morph';

import { isInputSignal, NgDocInputDeclaration } from '../angular/is-input';

/**
 * The members of `type`'s union in the order the author wrote them.
 *
 * The checker's order is not the author's: without `stableTypeOrdering` it is the creation order
 * of the member types (which depends on what the checker was asked before), with it literals sort
 * by value. A playground lists its options from that union, so the list is read from the syntax: the type node written for the input (its annotation, or the type
 * argument of `input<T>()`, `input.required<T>()` or `model<T>()`), followed through unions,
 * parentheses, non-generic type aliases and enums, to its literal members. Those members take their
 * written order, in the positions they hold in the checker's list; every member the syntax does
 * not name (`undefined` of an optional input, `boolean`'s literals, a generic alias) keeps the
 * checker's position. Without a written node the checker's order is returned.
 * @param declaration - The input property, accessor or pipe parameter.
 * @param type - The input's type.
 * @param members - The union's members in the order to fall back to (default: the checker's).
 */
export function writtenUnionOrder(
  declaration: NgDocInputDeclaration | Node,
  type: Type,
  members: Type[] = type.getUnionTypes(),
): Type[] {
  const node = writtenTypeNode(declaration);
  if (!node || members.length < 2) return members;
  const written: ts.Type[] = [];
  collect(node, written, new Set());
  const slots = new Set(members.map((member) => member.compilerType));
  const order = written.filter(
    (member, index) => slots.has(member) && written.indexOf(member) === index,
  );
  const named = new Set(order);
  let next = 0;
  const byCompiler = new Map(members.map((member) => [member.compilerType, member]));
  return members.map((member) =>
    named.has(member.compilerType) ? byCompiler.get(order[next++]!)! : member,
  );
}

/** The type node the author wrote for an input or parameter, if any. */
function writtenTypeNode(declaration: NgDocInputDeclaration | Node): TypeNode | undefined {
  if (Node.isPropertyDeclaration(declaration) && isInputSignal(declaration)) {
    const initializer = declaration.getInitializer();
    return Node.isCallExpression(initializer) ? initializer.getTypeArguments()[0] : undefined;
  }
  if (Node.isSetAccessorDeclaration(declaration))
    return declaration.getParameters()[0]?.getTypeNode();
  if (Node.isGetAccessorDeclaration(declaration)) return declaration.getReturnTypeNode();
  if (Node.isPropertyDeclaration(declaration) || Node.isParameterDeclaration(declaration))
    return declaration.getTypeNode();
  return undefined;
}

/** Appends the member types `node` names, in written order. */
function collect(node: TypeNode, into: ts.Type[], seen: Set<Node>): void {
  if (seen.has(node)) return;
  seen.add(node);
  if (Node.isUnionTypeNode(node)) {
    node.getTypeNodes().forEach((member) => collect(member, into, seen));
    return;
  }
  if (Node.isParenthesizedTypeNode(node)) {
    collect(node.getTypeNode(), into, seen);
    return;
  }
  if (Node.isTypeReference(node) && !node.getTypeArguments().length) {
    let symbol = node.getTypeName().getSymbol();
    if (symbol?.isAlias()) symbol = symbol.getAliasedSymbol();
    const declaration = symbol?.getDeclarations()[0];
    if (Node.isTypeAliasDeclaration(declaration) && !declaration.getTypeParameters().length) {
      const aliased = declaration.getTypeNode();
      if (aliased) {
        collect(aliased, into, seen);
        return;
      }
    }
    if (Node.isEnumDeclaration(declaration)) {
      declaration.getMembers().forEach((member) => into.push(member.getType().compilerType));
      return;
    }
  }
  into.push(node.getType().compilerType);
}
