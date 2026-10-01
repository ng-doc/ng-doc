import { ts } from 'ts-morph';

import { compareCodeUnits } from '../kernel/canonical';
import { suspendRecording } from './recorder';

/**
 * Canonical union member order in printed types.
 *
 * With `stableTypeOrdering` the checker orders a union's members by kind, name, value, declaration
 * position and file order, then by their type arguments or mappers, and only then by type id
 * (creation order). Members that tie on every earlier key still depend on which queries ran first:
 * object types without a symbol, an alias or a reference target (reverse-mapped types:
 * `unbox({ p: ... }) | unbox({ q: ... })`), and every type that wraps one: `Holder<R1> |
 * Holder<R2>`, a mapped alias `M<R1> | M<R2>`, `(R1 & Tag) | (R2 & Tag)`.
 *
 * Every type the generator prints goes through the checker's `typeToString` (ts-morph
 * `Type.getText`), so {@link canonicalTypeText} wraps it once per checker. While a type prints,
 * every union (and intersection) it holds is reordered, innermost first: its members are grouped by everything but
 * their type arguments and mappers (flags, symbol, alias and reference target; an intersection by
 * its parts), and each group is sorted by its members' printed text, stably, with every other
 * member where it was. The walk follows union and intersection members, origins, type arguments,
 * and the properties and signatures of the object types the printer spells out (anonymous,
 * mapped, reverse-mapped), up to {@link DEPTH} levels. The unions are restored afterwards.
 * {@link canonicalUnionMembers} is the same order for code that reads a union's members.
 *
 * Not covered (a documented limitation): two members that tie on every key including their
 * symbol's position (`compareSymbols` ends with the symbol id), and ties nested deeper than the
 * walk goes.
 */
const installed = new WeakSet<object>();

/** How many levels of properties and signatures the walk follows. */
const DEPTH = 4;

/** Installs the canonical order on `checker`'s `typeToString`; later calls do nothing. */
export function canonicalTypeText(checker: ts.TypeChecker): void {
  if (installed.has(checker)) return;
  installed.add(checker);
  const typeToString = checker.typeToString;
  let depth = 0;
  checker.typeToString = function (
    this: ts.TypeChecker,
    type: ts.Type,
    enclosing?: ts.Node,
    flags?: ts.TypeFormatFlags,
  ): string {
    // The sort keys print through the unwrapped function, on the unions reordered so far.
    const print = (member: ts.Type) => typeToString.call(checker, member, enclosing, flags);
    const restore: Array<[ts.Type, readonly ts.Type[]]> = [];
    depth++;
    try {
      if (depth === 1) reorder(type, print, checker, restore);
      return typeToString.call(this, type, enclosing, flags);
    } finally {
      depth--;
      for (const [union, types] of restore.reverse())
        (union as unknown as MutableUnion).types = types;
    }
  };
}

/** The members of a union in the canonical order (a copy; the union is not changed). */
export function canonicalUnionMembers(
  members: readonly ts.Type[],
  print: (member: ts.Type) => string,
): ts.Type[] {
  return ordered(members, print) ?? [...members];
}

interface MutableUnion {
  types: readonly ts.Type[];
}

interface TypeParts {
  types?: readonly ts.Type[];
  origin?: ts.Type;
  target?: ts.Type;
  resolvedTypeArguments?: readonly ts.Type[];
  aliasTypeArguments?: readonly ts.Type[];
  objectFlags?: number;
}

/**
 * What a union member is, but for its type arguments and mappers; undefined for a member that
 * never ties (every type that is not an object type or an intersection).
 */
function groupKey(type: ts.Type, ids: Map<object, number>): string | undefined {
  const id = (value: object | undefined) => {
    if (!value) return '-';
    let known = ids.get(value);
    if (known === undefined) ids.set(value, (known = ids.size));
    return String(known);
  };
  const parts = type as TypeParts;
  if (type.flags & ts.TypeFlags.Intersection)
    return `&(${(parts.types ?? []).map((part) => groupKey(part, ids) ?? `=${id(part)}`).join(',')})`;
  if (!(type.flags & ts.TypeFlags.Object)) return undefined;
  const objectFlags = parts.objectFlags ?? 0;
  return [
    'o',
    objectFlags & ObjectKind,
    id(type.symbol),
    id(type.aliasSymbol),
    objectFlags & ts.ObjectFlags.Reference ? id(parts.target) : '-',
  ].join(':');
}

const ObjectKind =
  ts.ObjectFlags.Class |
  ts.ObjectFlags.Interface |
  ts.ObjectFlags.Reference |
  ts.ObjectFlags.Tuple |
  ts.ObjectFlags.Anonymous |
  ts.ObjectFlags.Mapped |
  ts.ObjectFlags.ReverseMapped |
  ts.ObjectFlags.EvolvingArray;

/** The members with every group sorted by text, or undefined when nothing moves. */
function ordered(
  members: readonly ts.Type[],
  print: (member: ts.Type) => string,
): ts.Type[] | undefined {
  const ids = new Map<object, number>();
  const groups = new Map<string, number[]>();
  members.forEach((member, index) => {
    const key = groupKey(member, ids);
    if (key === undefined) return;
    const group = groups.get(key);
    if (group) group.push(index);
    else groups.set(key, [index]);
  });
  let result: ts.Type[] | undefined;
  for (const positions of groups.values()) {
    if (positions.length < 2) continue;
    const sorted = positions
      .map((index) => ({ member: members[index]!, key: print(members[index]!) }))
      .sort((left, right) => compareCodeUnits(left.key, right.key));
    if (sorted.every(({ member }, at) => member === members[positions[at]!])) continue;
    result ??= [...members];
    positions.forEach((index, at) => (result![index] = sorted[at]!.member));
  }
  return result;
}

/** Object types the printer spells out member by member. */
function structural(type: ts.Type): boolean {
  const flags = (type as TypeParts).objectFlags ?? 0;
  return (
    !!(type.flags & ts.TypeFlags.Object) &&
    !!(flags & (ts.ObjectFlags.Anonymous | ts.ObjectFlags.Mapped | ts.ObjectFlags.ReverseMapped))
  );
}

/**
 * Reorders every union `root` holds, innermost first, recording what to restore. Properties and
 * signatures are read with recording suspended: they belong to the printed type, not to a query.
 */
function reorder(
  root: ts.Type,
  print: (member: ts.Type) => string,
  checker: ts.TypeChecker,
  restore: Array<[ts.Type, readonly ts.Type[]]>,
): void {
  const seen = new Set<ts.Type>();
  const visit = (type: ts.Type | undefined, level: number): void => {
    if (!type || seen.has(type)) return;
    seen.add(type);
    const parts = type as TypeParts;
    for (const inner of [
      ...(parts.types ?? []),
      parts.origin,
      ...(parts.resolvedTypeArguments ?? []),
      ...(parts.aliasTypeArguments ?? []),
    ])
      visit(inner, level);
    if (level < DEPTH && structural(type))
      suspendRecording(() => {
        for (const property of checker.getPropertiesOfType(type))
          visit(checker.getTypeOfSymbol(property), level + 1);
        for (const kind of [ts.SignatureKind.Call, ts.SignatureKind.Construct])
          for (const signature of checker.getSignaturesOfType(type, kind)) {
            for (const parameter of signature.getParameters())
              visit(checker.getTypeOfSymbol(parameter), level + 1);
            visit(checker.getReturnTypeOfSignature(signature), level + 1);
          }
      });
    if (type.flags & (ts.TypeFlags.Union | ts.TypeFlags.Intersection) && parts.types) {
      const next = ordered(parts.types, print);
      if (next) {
        restore.push([type, parts.types]);
        (type as unknown as MutableUnion).types = next;
      }
    }
  };
  visit(root, 0);
}
