/**
 * @vitest-environment node
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { workspaceRoot } from '../styles/css-surface';

const root = workspaceRoot();
const INPUT_TYPE = join(root, 'libs/core/types/input-type.ts');

/**
 * Type-checks assertions about `InputType` against the real source and Angular's declarations.
 * The test runner does not check these assertions, so the spec runs the compiler itself.
 * @param source - The contents of `input-type.ts` to check.
 */
function diagnostics(source: string): string[] {
  const probe = join(root, 'libs/app/testing/types/__input-type-probe.ts');
  const files = new Map([
    [INPUT_TYPE, source],
    [
      probe,
      `
      import { booleanAttribute, input, InputSignal, model, numberAttribute } from '@angular/core';
      import { InputType } from '${INPUT_TYPE.replace(/\.ts$/, '')}';

      type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
      const expectType = <T extends true>(): T => true as T;

      class Target {
        plain = input<string>('');
        required = input.required<number>();
        count = input(0, { transform: numberAttribute });
        flag = input(false, { transform: booleanAttribute });
        custom = input<string[], string>([], { transform: (value: string) => value.split(',') });
        value = model<Date | null>(null);
        decorated: 'small' | 'large' = 'small';
      }

      interface Skeleton {
        optional?: InputSignal<boolean>;
      }

      expectType<Equal<InputType<Target, 'plain'>, string>>();
      expectType<Equal<InputType<Target, 'required'>, number>>();
      expectType<Equal<InputType<Target, 'count'>, unknown>>();
      expectType<Equal<InputType<Target, 'flag'>, unknown>>();
      expectType<Equal<InputType<Target, 'custom'>, string>>();
      expectType<Equal<InputType<Target, 'value'>, Date | null>>();
      expectType<Equal<InputType<Target, 'decorated'>, 'small' | 'large'>>();
      // An optional signal input of an interface (a type-control or page-skeleton field) is set
      // with its value, not with the signal.
      expectType<Equal<InputType<Skeleton, 'optional'>, boolean>>();
      `,
    ],
  ]);
  const options: ts.CompilerOptions = {
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    types: [],
  };
  const host = ts.createCompilerHost(options);
  const readFile = host.readFile.bind(host);
  const fileExists = host.fileExists.bind(host);
  host.readFile = (file) => files.get(file) ?? readFile(file);
  host.fileExists = (file) => files.has(file) || fileExists(file);
  host.getSourceFile = (file, language) => {
    const text = host.readFile(file);
    return text === undefined ? undefined : ts.createSourceFile(file, text, language, true);
  };
  const program = ts.createProgram([probe], options, host);

  return ts.getPreEmitDiagnostics(program).map((item) => {
    const line =
      item.file && item.start !== undefined
        ? item.file.getLineAndCharacterOfPosition(item.start).line + 1
        : 0;
    const text = item.file?.text.split('\n')[line - 1]?.trim() ?? '';

    return `${text}: ${ts.flattenDiagnosticMessageText(item.messageText, '\n')}`;
  });
}

describe('InputType', () => {
  it('is the type each kind of input is set with', () => {
    expect(diagnostics(readFileSync(INPUT_TYPE, 'utf8'))).toEqual([]);
  });

  it('fails when a signal input resolves to the signal itself', () => {
    const released =
      "import { InputSignal } from '@angular/core';\nexport type InputType<T, K extends keyof T> = T[K] extends InputSignal<infer R> ? R : T[K];\n";

    expect(diagnostics(released).length).toBeGreaterThan(0);
  });
});
