import { Project, ts } from 'ts-morph';
import { expect, test } from 'vitest';

import { canonicalTypeText, canonicalUnionMembers } from '../type-text';

// Union members that tie on every key of `stableTypeOrdering` but the type id print in the order
// of their text, whatever the checker created first; every other member keeps its place.

const SOURCE = [
  'type Box<V> = { value: V };',
  'declare function unbox<T>(x: { [K in keyof T]: Box<T[K]> }): T;',
  'declare const flag: boolean;',
  'export const alpha = unbox({ p: { value: 1 } });',
  "export const zeta = unbox({ q: { value: 's' } });",
  'export const u = flag ? zeta : alpha;',
  "export const mixed = flag ? zeta : flag ? 'lit' : alpha;",
  'interface Tag {\n  t: 1;\n}',
  'type M<T> = { [K in keyof T]: T[K] };',
  'declare const hz: Holder<typeof zeta>;',
  'declare const ha: Holder<typeof alpha>;',
  'export const holders = flag ? hz : ha;',
  'declare const iz: typeof zeta & Tag;',
  'declare const ia: typeof alpha & Tag;',
  'export const inter = flag ? iz : ia;',
  'declare const mz: M<typeof zeta>;',
  'declare const ma: M<typeof alpha>;',
  'export const mapped = flag ? mz : ma;',
  'export const prop = { a: flag ? zeta : alpha };',
  'export const fn = (x: typeof zeta | typeof alpha) => (flag ? zeta : alpha);',
  'export const both = null! as typeof zeta & typeof alpha;',
  'interface Holder<T> {\n  held: T;\n}',
  'export declare const nested: Holder<typeof u>;',
  '',
].join('\n');

/** A fresh program; `first` names the declaration whose type the checker creates first. */
function program(first: 'alpha' | 'zeta', canonical: boolean) {
  const project = new Project({
    useInMemoryFileSystem: true,
    skipLoadingLibFiles: true,
    compilerOptions: {
      noLib: true,
      strict: true,
      target: ts.ScriptTarget.ES2022,
      stableTypeOrdering: true,
    } as ts.CompilerOptions,
  });
  const file = project.createSourceFile('/a.ts', SOURCE);
  const checker = project.getProgram().compilerObject.getTypeChecker();
  if (canonical) canonicalTypeText(checker);
  file.getVariableDeclarationOrThrow(first).getType().getText();
  const text = (name: string) => file.getVariableDeclarationOrThrow(name).getType().getText();
  return { file, checker, text };
}

test('without the canonical order, tied members print in creation order', () => {
  expect(program('alpha', false).text('u')).not.toBe(program('zeta', false).text('u'));
});

test('tied members print by their text, at every level, whatever was created first', () => {
  for (const name of ['u', 'mixed', 'nested', 'holders', 'inter', 'mapped', 'prop', 'fn', 'both'])
    expect({ name, text: program('zeta', true).text(name) }).toEqual({
      name,
      text: program('alpha', true).text(name),
    });
  const { text } = program('zeta', true);
  expect(text('u')).toBe('{ p: number; } | { q: string; }');
  expect(text('nested')).toBe('Holder<{ p: number; } | { q: string; }>');
  // Wrapped ties: grouped by everything but their type arguments and sorted by text.
  expect(text('holders')).toBe('Holder<{ p: number; }> | Holder<{ q: string; }>');
  expect(text('inter')).toBe('({ p: number; } & Tag) | ({ q: string; } & Tag)');
  expect(text('mapped')).toBe('M<{ p: number; }> | M<{ q: string; }>');
  // Inside properties and signatures.
  expect(text('prop')).toBe('{ a: { p: number; } | { q: string; }; }');
  expect(text('fn')).toBe(
    '(x: { p: number; } | { q: string; }) => { p: number; } | { q: string; }',
  );
  expect(text('both')).toBe('{ p: number; } & { q: string; }');
  // A member that is not tied (a literal) keeps its place among them.
  expect(text('mixed').split(' | ')).toContain('"lit"');
});

test('a failing print restores the unions it reordered', () => {
  const { file, checker } = program('zeta', false);
  const original = checker.typeToString;
  checker.typeToString = function (this: ts.TypeChecker, ...args: Parameters<typeof original>) {
    if (args[0].flags & ts.TypeFlags.Union) throw new Error('printer failure');
    return original.apply(this, args);
  };
  canonicalTypeText(checker);
  const union = file.getVariableDeclarationOrThrow('u').getType().compilerType as ts.UnionType;
  const before = [...union.types];
  expect(() => checker.typeToString(union)).toThrow('printer failure');
  expect(union.types).toEqual(before);
});

test('the union itself is restored after printing, and installing twice changes nothing', () => {
  const { file, checker, text } = program('zeta', true);
  const union = file.getVariableDeclarationOrThrow('u').getType().compilerType as ts.UnionType;
  const before = [...union.types];
  const printed = text('u');
  expect(union.types).toEqual(before);
  canonicalTypeText(checker);
  expect(text('u')).toBe(printed);
});

test('canonical members: a copy in the printed order, unchanged when nothing ties', () => {
  const { file, checker } = program('zeta', false);
  const union = file.getVariableDeclarationOrThrow('u').getType().compilerType as ts.UnionType;
  const print = (type: ts.Type) => checker.typeToString(type);
  const members = canonicalUnionMembers(union.types, print);
  expect(members.map(print)).toEqual(['{ p: number; }', '{ q: string; }']);
  expect(members).not.toBe(union.types);
  const literal = file.getVariableDeclarationOrThrow('mixed').getType()
    .compilerType as ts.UnionType;
  const single = literal.types.filter((type) => !(type.flags & ts.TypeFlags.Object));
  expect(canonicalUnionMembers(single, print)).toEqual(single);
});
