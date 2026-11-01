import { Project, SourceFile } from 'ts-morph';
import { describe, expect, it } from 'vitest';

import { getPlaygroundComponentInputs } from '../playground/get-playground-inputs';
import { createProject } from '../typescript/create-project';

// An array of a union of literals gets the members of its item type as its options, which the
// playground's multi-select offers. The new engine calls the same helper (its semantic suite
// compares both engines on one fixture); this spec covers the legacy engine's inputs.

const TYPES = `
export type Size = 'small' | 'medium' | 'large';
export enum Status { Good = 'good', Bad = 'bad' }
export type Sizes = Size[];
`;

const COMPONENT = `
import { Component, Input, input, model } from '@angular/core';
import { Size, Sizes, Status } from './types';

@Component({ selector: 'app-box', template: '' })
export class Box {
  sizes = input<Size[]>(['small']);
  written = input<('b' | 'a')[]>([]);
  generic = input<ReadonlyArray<'y' | 'x'>>([]);
  optional = input<readonly Size[]>();
  @Input() decorated?: Array<'z' | 'w'>;
  nullable = model<Size[] | null>(null);
  statuses = input<Status[]>([]);
  withBoolean = input<('m' | boolean)[]>([]);
  nullableItems = input<('n' | undefined)[]>([]);
  strings = input<string[]>([]);
  flags = input<boolean[]>([]);
  alias = input<Sizes>([]);
  tuple = input<['a' | 'b']>(['a']);
  either = input<'a'[] | 'b'[]>([]);
  scalar = input<Size>('small');
}
`;

/** A program whose checker has created the later members first. */
function warmed(): { project: Project; box: SourceFile } {
  const project = createProject({
    compilerOptions: { strict: true, experimentalDecorators: true },
  });
  project.createSourceFile('types.ts', TYPES, { overwrite: true });
  const warm = project.createSourceFile(
    'warm.ts',
    `export const w: ['large', 'a', 'x', 'w', true] = ['large', 'a', 'x', 'w', true];`,
    { overwrite: true },
  );
  const box = project.createSourceFile('box.ts', COMPONENT, { overwrite: true });
  project.resolveSourceFileDependencies();
  warm.getVariableDeclarationOrThrow('w').getType().getTupleElements();
  return { project, box };
}

describe('playground options of array inputs (legacy engine)', () => {
  it('lists the members of a union of literals that the items are, in the written order', () => {
    const { box } = warmed();
    const properties = getPlaygroundComponentInputs(box.getClassOrThrow('Box'));
    const options = Object.fromEntries(
      Object.entries(properties).map(([name, property]) => [name, property.options]),
    );
    const sizes = ["'small'", "'medium'", "'large'"];

    expect(options).toMatchObject({
      sizes,
      written: ["'b'", "'a'"],
      generic: ["'y'", "'x'"],
      optional: sizes,
      decorated: ["'z'", "'w'"],
      nullable: sizes,
      // Enum members carry their names and values, as in the new engine.
      statuses: [
        { label: 'Good', value: 'good' },
        { label: 'Bad', value: 'bad' },
      ],
      // `boolean` names no literal: its members follow by their text.
      withBoolean: ["'m'", 'false', 'true'],
      // The items are values: `undefined` is left out.
      nullableItems: ["'n'"],
      // Not arrays of literal unions: the members of the input's own union, as before.
      strings: [],
      flags: [],
      alias: [],
      tuple: [],
      scalar: expect.arrayContaining(sizes),
    });
    expect(options['either']).toHaveLength(2);
    expect(properties['sizes'].type).toBe('Size[]');
  });
});
