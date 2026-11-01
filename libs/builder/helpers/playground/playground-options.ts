import type { NgDocPlaygroundOption } from '@ng-doc/core';
import { Node, SyntaxKind, Type, TypeFormatFlags, TypeNode } from 'ts-morph';

import { NgDocInputDeclaration } from '../angular/is-input';
import { compareText } from '../text-order';
import { writtenOrder, writtenTypeNode } from './written-union-order';

/** How option texts are printed: in full, with the single quotes the runtime evaluates. */
const OPTION_TEXT_FLAGS: TypeFormatFlags =
  TypeFormatFlags.NoTruncation | TypeFormatFlags.UseSingleQuotesForStringLiteralType;

/**
 * An option of a union input. The runtime evaluates the printed text of a member, which works for
 * literals (`'small'`, `1`) but not for an enum member (`Status.Good`): a member of an enum is the
 * member's name, which the playground shows, and the literal value the checker resolved for it,
 * which the playground sets.
 * @param member - A member of the input's union type.
 */
export function playgroundOption(member: Type): string | NgDocPlaygroundOption {
  if (member.isEnumLiteral()) {
    const value = member.getLiteralValue();
    const name = member.getSymbol()?.getName();
    if (name && (typeof value === 'string' || typeof value === 'number'))
      return { label: name, value };
  }
  return member.getText(undefined, OPTION_TEXT_FLAGS);
}

/**
 * The options of an array input whose items are a union of literals, such as `NgDocSize[]`,
 * `('a' | 'b')[]`, `Array<'x' | 'y'>` or `Status[]` of an enum, optional or nullable too: the
 * members of the item type, which the playground's multi-select offers. Both engines call it, so
 * their options are the same.
 *
 * The members are listed in the order the item type is written (`writtenOrder`), and the members
 * the syntax does not name (the literals of a `boolean` among them) by their printed text, never
 * in the checker's order, which differs between the engines' programs. `undefined` and `null`
 * items are left out: the multi-select adds values. An array of booleans only, a tuple, an
 * array whose items are not all literals, and an alias of an array type (printed by its name, so
 * the playground can't read it as an array) have no such options.
 * @param declaration - The input property, accessor or pipe parameter.
 * @param type - The input's type.
 * @returns The options, or `undefined` when the input is not such an array.
 */
export function playgroundArrayOptions(
  declaration: NgDocInputDeclaration | Node,
  type: Type,
): Array<string | NgDocPlaygroundOption> | undefined {
  const arrays: Type[] = withoutNullish(type.isUnion() ? type.getUnionTypes() : [type]);
  const array: Type | undefined = arrays.length === 1 ? arrays[0] : undefined;

  if (!array || !(array.isArray() || array.isReadonlyArray()) || array.getAliasSymbol()) {
    return undefined;
  }

  const item: Type | undefined = array.getTypeArguments()[0];
  const members: Type[] = item?.isUnion() ? withoutNullish(item.getUnionTypes()) : [];

  if (
    !members.length ||
    !members.every(isLiteral) ||
    members.every((member: Type) => member.isBooleanLiteral())
  ) {
    return undefined;
  }

  const byText: Type[] = [...members].sort((a: Type, b: Type) => compareTexts(text(a), text(b)));

  return writtenOrder(itemTypeNode(writtenTypeNode(declaration)), byText).map(playgroundOption);
}

/**
 * The type node of the items of a written array type: `T` of `T[]`, `readonly T[]`, `Array<T>`
 * and `ReadonlyArray<T>`, alone or in a union with `undefined` or `null`.
 * @param node - The written type of the input.
 */
function itemTypeNode(node: TypeNode | undefined): TypeNode | undefined {
  if (!node) return undefined;
  if (Node.isParenthesizedTypeNode(node)) return itemTypeNode(node.getTypeNode());
  if (Node.isUnionTypeNode(node)) {
    const rest: TypeNode[] = node.getTypeNodes().filter((member: TypeNode) => !isNullish(member));
    return rest.length === 1 ? itemTypeNode(rest[0]) : undefined;
  }
  if (Node.isTypeOperatorTypeNode(node) && node.getOperator() === SyntaxKind.ReadonlyKeyword)
    return itemTypeNode(node.getTypeNode());
  if (Node.isArrayTypeNode(node)) return node.getElementTypeNode();
  if (Node.isTypeReference(node) && /^(?:Readonly)?Array$/.test(node.getTypeName().getText()))
    return node.getTypeArguments()[0];
  return undefined;
}

/**
 * Whether a written type is `undefined` or `null`.
 * @param node - A member of a written union.
 */
function isNullish(node: TypeNode): boolean {
  return (
    node.getKind() === SyntaxKind.UndefinedKeyword ||
    (Node.isLiteralTypeNode(node) && node.getLiteral().getKind() === SyntaxKind.NullKeyword)
  );
}

/**
 * The types other than `undefined` and `null`.
 * @param types - The members of a union.
 */
function withoutNullish(types: Type[]): Type[] {
  return types.filter((type: Type) => !type.isUndefined() && !type.isNull());
}

/**
 * Whether a type is a literal the playground can set: a string, number or boolean literal, or an
 * enum member.
 * @param type - A member of the item union.
 */
function isLiteral(type: Type): boolean {
  return (
    type.isStringLiteral() ||
    type.isNumberLiteral() ||
    type.isBooleanLiteral() ||
    type.isEnumLiteral()
  );
}

/**
 * The printed text of a member.
 * @param type - A member of the item union.
 */
function text(type: Type): string {
  return type.getText(undefined, OPTION_TEXT_FLAGS);
}

/**
 * Orders texts in NgDoc's fixed text order, and texts the collator finds equal by code units, so
 * the order never depends on the program or the machine.
 * @param a - A text.
 * @param b - Another text.
 */
function compareTexts(a: string, b: string): number {
  return compareText(a, b) || (a < b ? -1 : a > b ? 1 : 0);
}
