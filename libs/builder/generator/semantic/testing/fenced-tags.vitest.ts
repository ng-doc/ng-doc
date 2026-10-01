import { Project } from 'ts-morph';
import { expect, test } from 'vitest';

import { createJsDoc } from '../rendering';

function fixture(lines: string[]) {
  const project = new Project({ useInMemoryFileSystem: true });
  return project
    .createSourceFile(
      'tags.ts',
      ['/**', ...lines.map((line) => ` * ${line}`), ' */', 'export function value() {}'].join('\n'),
    )
    .getFunctionOrThrow('value');
}
const docs = createJsDoc((text) => text);

test('fenced decorators are text in every JSDoc tag view, including the exact @parser case', () => {
  const node = fixture([
    'Summary.',
    '```typescript',
    '@parser({})',
    '@internal literal',
    '```',
    '@custom legitimate',
    '@parser real parser tag',
  ]);
  expect(docs.getJsDocDescription(node)).toContain('@parser({})');
  expect(docs.hasJsDocTag(node, 'internal')).toBe(false);
  expect(docs.getJsDocTag(node, 'internal')).toBe('');
  expect(docs.getJsDocTags(node, 'internal')).toEqual([]);
  expect(docs.getJsDocTag(node, 'parser')).toBe('real parser tag');
  expect(docs.getAllJsDocTags(node)).toEqual({
    custom: ['legitimate'],
    parser: ['real parser tag'],
  });
});

test('fenced text remains inside repeated remarks and examples without consuming following custom tags', () => {
  const node = fixture([
    'Summary.',
    '@remarks First remark.',
    '```ts',
    '@firstRemark code',
    '```',
    '@remarks Second remark.',
    '```ts',
    '@secondRemark code',
    '```',
    '@example First example.',
    '```ts',
    '@firstExample code',
    '```',
    '@example Second example.',
    '```ts',
    '@secondExample code',
    '```',
    '@custom legitimate',
    '@empty',
  ]);
  expect(docs.getJsDocTags(node, 'remarks')).toEqual([
    'First remark.\n```ts\n@firstRemark code\n```',
    'Second remark.\n```ts\n@secondRemark code\n```',
  ]);
  expect(docs.getJsDocTags(node, 'example')).toEqual([
    'First example.\n```ts\n@firstExample code\n```',
    'Second example.\n```ts\n@secondExample code\n```',
  ]);
  expect(Object.keys(docs.getAllJsDocTags(node))).toEqual([
    'remarks',
    'example',
    'custom',
    'empty',
  ]);
  expect(docs.getJsDocTag(node, 'custom')).toBe('legitimate');
  expect(docs.getJsDocTags(node, 'empty')).toEqual(['']);
});

test('plain tags, fences without false tags, absent docs and fenced-only docs retain their existing values', () => {
  expect(docs.getAllJsDocTags(fixture(['@custom plain', '@custom second']))).toEqual({
    custom: ['plain', 'second'],
  });
  expect(
    docs.getAllJsDocTags(fixture(['```ts', 'const value = 1;', '```', '@custom plain'])),
  ).toEqual({ custom: ['plain'] });
  expect(docs.getAllJsDocTags(fixture(['```ts', '@parser({})', '```']))).toEqual({});
  expect(docs.getAllJsDocTags()).toEqual({});
});
