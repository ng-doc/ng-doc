import { Project, SourceFile, TypeFormatFlags } from 'ts-morph';
import { describe, expect, it } from 'vitest';

import { getInputType } from '../angular/get-input-type';
import { NgDocInputDeclaration } from '../angular/is-input';
import { writtenUnionOrder } from '../playground/written-union-order';
import { createProject } from '../typescript/create-project';

// Playground options follow the order the author wrote, never the checker's union order, which
// depends on what the checker was asked before.

const TYPES = `
export type Color = 'primary' | 'warning' | 'link';
export type Nested = Color | ('x' | 'y');
export type Generic<T> = T | 'g';
export enum Size { Medium = 'medium', Small = 'small' }
`;

const COMPONENT = `
import { Component, Input, input, model } from '@angular/core';
import { Color, Generic, Nested, Size } from './types';

@Component({ selector: 'app-box', template: '' })
export class Box {
  @Input() color: Color = 'primary';
  @Input() nested: Nested = 'x';
  @Input() size: Size = Size.Medium;
  tone = input<'soft' | 'link' | 'loud'>('soft');
  required = input.required<'z' | 'link'>();
  bound = model<'m' | 'link'>('m');
  inferred = input('link' as 'q' | 'link');
  @Input() mode?: 'b' | 'a';
  @Input() generic: Generic<'link'> = 'g';
  @Input() flag = false;
  @Input() set setter(value: 's' | 'link') {}
  @Input() get getter(): 'r' | 'link' { return 'r'; }
}
`;

/** A checker that has created `'link'`, `'loud'`, `'y'`, `'a'` and `Size.Small` before anything else. */
function warmed(): { project: Project; box: SourceFile } {
  const project = createProject({
    compilerOptions: { strict: true, experimentalDecorators: true },
  });
  project.createSourceFile('types.ts', TYPES, { overwrite: true });
  const warm = project.createSourceFile(
    'warm.ts',
    `import { Size } from './types';\nexport const w: ['link', 'loud', 'y', 'a', Size.Small] = ['link', 'loud', 'y', 'a', Size.Small];`,
    { overwrite: true },
  );
  const box = project.createSourceFile('box.ts', COMPONENT, { overwrite: true });
  project.resolveSourceFileDependencies();
  warm.getVariableDeclarationOrThrow('w').getType().getTupleElements();
  return { project, box };
}

const text = (types: ReturnType<typeof writtenUnionOrder>) =>
  types.map((type) =>
    type.getText(
      undefined,
      TypeFormatFlags.NoTruncation | TypeFormatFlags.UseSingleQuotesForStringLiteralType,
    ),
  );

describe('writtenUnionOrder', () => {
  it('lists the members of every input in the written order', () => {
    const { box } = warmed();
    const declaration = box.getClassOrThrow('Box');
    const inputs = [
      ...declaration.getProperties(),
      ...declaration.getSetAccessors(),
      ...declaration.getGetAccessors(),
    ] as NgDocInputDeclaration[];
    const options = Object.fromEntries(
      inputs.map((input) => [
        input.getName(),
        text(
          writtenUnionOrder(
            input,
            // A setter's type is its parameter's.
            input.getKindName() === 'SetAccessor' ? input.getType() : getInputType(input),
          ),
        ),
      ]),
    );
    expect(options).toEqual({
      color: ["'primary'", "'warning'", "'link'"],
      nested: ["'primary'", "'warning'", "'link'", "'x'", "'y'"],
      size: ['Size.Medium', 'Size.Small'],
      tone: ["'soft'", "'link'", "'loud'"],
      required: ["'z'", "'link'"],
      bound: ["'m'", "'link'"],
      // No written type node: the checker's order.
      inferred: expect.arrayContaining(["'q'", "'link'"]),
      // `undefined` keeps the checker's position; the written members take their order.
      mode: ['undefined', "'b'", "'a'"],
      // A generic alias is not followed: the checker's order.
      generic: expect.arrayContaining(["'g'", "'link'"]),
      flag: ['false', 'true'],
      setter: ["'s'", "'link'"],
      getter: ["'r'", "'link'"],
    });
    // The checker's own order, which the options no longer follow.
    const color = declaration.getPropertyOrThrow('color');
    expect(text(getInputType(color).getUnionTypes())).toEqual(["'link'", "'primary'", "'warning'"]);
  });

  it('lists pipe parameters in the written order', () => {
    const { project } = warmed();
    const pipe = project.createSourceFile(
      'pipe.ts',
      `export class P { transform(value: string, tone: 'soft' | 'link'): string { return value; } }`,
      { overwrite: true },
    );
    const tone = pipe.getClassOrThrow('P').getMethodOrThrow('transform').getParameters()[1]!;
    expect(text(writtenUnionOrder(tone, tone.getType()))).toEqual(["'soft'", "'link'"]);
  });

  it('returns the checker order without a written node or a union', () => {
    const { box } = warmed();
    const flag = box.getClassOrThrow('Box').getPropertyOrThrow('flag') as NgDocInputDeclaration;
    expect(text(writtenUnionOrder(flag, getInputType(flag)))).toEqual(['false', 'true']);
    const method = box.getClassOrThrow('Box');
    expect(writtenUnionOrder(method, getInputType(flag))).toEqual(
      getInputType(flag).getUnionTypes(),
    );
    const color = box.getClassOrThrow('Box').getPropertyOrThrow('color');
    const single = box.getClassOrThrow('Box').getPropertyOrThrow('tone').getType();
    expect(writtenUnionOrder(color, single)).toEqual([]);
  });
});
