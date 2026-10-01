import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Dependency } from '../../contracts';
import { CONFLICTING_CONTENT_DIGEST } from '../../graph';
import { digest, SemanticFailure, TrackedFiles } from '../dependencies';

describe('semantic tracked files', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ng-doc-tracked-files-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('orders deterministically, replaces logical dependencies, and returns defensive values', () => {
    const contentPath = path.join(root, 'content.ts');
    const glob: Extract<Dependency, { kind: 'glob' }> = {
      kind: 'glob',
      root,
      include: ['**/*.ts'],
      exclude: ['generated/**'],
      members: [contentPath],
    };
    const tracker = new TrackedFiles([
      {
        kind: 'semantic',
        scopeId: 'project',
        digest: 'semantic',
        files: [contentPath],
        reason: 'program',
      },
      glob,
      { kind: 'content', path: contentPath, digest: 'old' },
      { kind: 'existence', path: contentPath, exists: true },
    ]);
    tracker.add({ kind: 'content', path: contentPath, digest: 'new' });
    tracker.add({ ...glob, members: [contentPath, path.join(root, 'second.ts')] });
    glob.members.push(path.join(root, 'input-mutated.ts'));

    const first = tracker.all();
    const serialized = first.map((dependency) => JSON.stringify(dependency));
    expect(serialized).toEqual([...serialized].sort((left, right) => left.localeCompare(right)));
    // Two different digests of one path are not replaced last-wins: no single digest describes
    // what was used, so the observation is recorded as conflicting.
    expect(first.filter((dependency) => dependency.kind === 'content')).toEqual([
      { kind: 'content', path: contentPath, digest: CONFLICTING_CONTENT_DIGEST },
    ]);
    expect(first.filter((dependency) => dependency.kind === 'glob')).toEqual([
      { ...glob, members: [contentPath, path.join(root, 'second.ts')] },
    ]);

    first.reverse();
    const returnedContent = first.find(
      (dependency): dependency is Extract<Dependency, { kind: 'content' }> =>
        dependency.kind === 'content',
    );
    const returnedGlob = first.find(
      (dependency): dependency is Extract<Dependency, { kind: 'glob' }> =>
        dependency.kind === 'glob',
    );
    returnedContent!.digest = 'caller-mutated';
    returnedGlob!.members.push(path.join(root, 'caller-mutated.ts'));

    expect(tracker.all()).toEqual(
      expect.arrayContaining([
        { kind: 'content', path: contentPath, digest: CONFLICTING_CONTENT_DIGEST },
        { ...glob, members: [contentPath, path.join(root, 'second.ts')] },
      ]),
    );
  });

  it('records a missing read and replaces it with recovered existence and content', () => {
    const file = path.join(root, 'later.ts');
    const tracker = new TrackedFiles();

    expect(() => tracker.read(file)).toThrow(SemanticFailure);
    expect(tracker.all()).toEqual([{ kind: 'existence', path: file, exists: false }]);

    fs.writeFileSync(file, 'export const recovered = true;');
    expect(tracker.read(file)).toBe('export const recovered = true;');
    expect(tracker.all()).toEqual([
      { kind: 'content', path: file, digest: digest('export const recovered = true;') },
      { kind: 'existence', path: file, exists: true },
    ]);
  });
});
