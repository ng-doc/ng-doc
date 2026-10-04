import { Project } from 'ts-morph';
import { expect, test } from 'vitest';

import { docNode, supported } from '../api-enumeration';
import { API_DESCRIPTION_LIMIT, apiSummary } from '../api-summary';

/**
 * The summary of every supported exported declaration of a source text, by name.
 * @param text - The source text.
 */
function summaries(text: string): Record<string, ReturnType<typeof apiSummary>> {
  const source = new Project({ useInMemoryFileSystem: true }).createSourceFile('api.ts', text);
  const result: Record<string, ReturnType<typeof apiSummary>> = {};
  for (const [name, nodes] of source.getExportedDeclarations()) {
    const node = nodes.find(supported);
    if (node) result[name] = apiSummary(node, docNode(node));
  }
  return result;
}

test('signatures are the declaration headers as written, without bodies or initializers', () => {
  const result = summaries(`
    import { Component, Injectable, Input } from '@angular/core';
    interface Base<T> { value: T }
    interface Other {}
    @Component({ selector: 'x-widget', template: '' })
    export abstract class Widget<T extends string = string>
      extends Array<T>
      implements Base<T>, Other {
      @Input() value!: T;
    }
    @Injectable
    export class Plain {}
    @Custom('one', 2)
    export class Called {}
    export interface Shape<T> extends Base<T>, Other { size: number }
    export const enum Direction { Up, Down }
    export type Short<T> = T | null;
    export type Long = { first: string; second: number; third: boolean; fourth: string[]; fifth: never };
    export function overloaded(value: string): string;
    export function overloaded(value: number, radix?: number): number;
    export function overloaded(value: unknown, radix = 10): unknown { return value; }
    export function spread<T>({ a }: { a: T }, ...rest: string[]) { return a; }
    export const TYPED: ReadonlyArray<string> = [], INFERRED = new Map<string, number>();
    export let bare;
    export default class {}
  `);

  expect(result['Widget'].signature).toBe(
    '@Component({ … })\nexport abstract class Widget<T extends string = string> extends Array<T> implements Base<T>, Other',
  );
  expect(result['Plain'].signature).toBe('@Injectable\nexport class Plain');
  expect(result['Called'].signature).toBe('@Custom(…)\nexport class Called');
  expect(result['Shape'].signature).toBe('export interface Shape<T> extends Base<T>, Other { … }');
  expect(result['Direction'].signature).toBe('export const enum Direction { … }');
  expect(result['Short'].signature).toBe('export type Short<T> = T | null');
  expect(result['Long'].signature).toBe('export type Long = …');
  expect(result['overloaded'].signature).toBe('export function overloaded(value: string): string');
  expect(result['spread'].signature).toBe(
    'export function spread<T>({ a }: { a: T }, ...rest: string[])',
  );
  expect(result['TYPED'].signature).toBe('export const TYPED: ReadonlyArray<string>');
  expect(result['INFERRED'].signature).toBe('export const INFERRED = …');
  expect(result['bare'].signature).toBe('export let bare');
  expect(result['default'].signature).toBe('export default class default');
});

test('an implementation without overloads, an optional parameter and a declaration without export', () => {
  const source = new Project({ useInMemoryFileSystem: true }).createSourceFile(
    'api.ts',
    'function local(a?: string, b = 1): void {}\nconst hidden = 1;\nexport { local, hidden };',
  );
  const local = source.getFunctionOrThrow('local');
  const hidden = source.getVariableDeclarationOrThrow('hidden');
  expect(apiSummary(local, docNode(local)).signature).toBe('function local(a?: string, b?): void');
  expect(apiSummary(hidden, docNode(hidden)).signature).toBe('const hidden = …');
});

test('descriptions are the first paragraph of the last doc comment as one line of plain text', () => {
  const long = `${'word '.repeat(40)}end.`;
  const result = summaries(`
    /** Old comment. */
    /**
     * Opens {@link Dialog} and {@link Other | the other one}, {@linkcode Code label},
     * see [the guide](https://ng-doc.com) and use \`code\` with **bold** text.
     *
     * Second paragraph.
     * @param x - ignored
     */
    export function linked(x: string): void {}

    /** First sentence stays. ${long} */
    export const sentence = 1;

    /** ${long} ${long} */
    export class Cut {}

    /** @deprecated only tags */
    export interface Tagged {}

    export type Undocumented = string;
  `);

  expect(result['linked'].description).toBe(
    'Opens Dialog and the other one, label, see the guide and use code with bold text.',
  );
  expect(result['sentence'].description).toBe('First sentence stays.');
  expect(result['Cut'].description?.length).toBeLessThanOrEqual(API_DESCRIPTION_LIMIT);
  expect(result['Cut'].description).toMatch(/^word word .*word…$/);
  expect(result['Tagged']).not.toHaveProperty('description');
  expect(result['Undocumented']).toEqual({ signature: 'export type Undocumented = string' });
});
