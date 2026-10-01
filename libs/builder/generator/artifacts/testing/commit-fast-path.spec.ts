/** @vitest-environment node */

import { createHash } from 'node:crypto';
import {
  link,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename as renameFile,
  rm,
  stat,
  symlink,
  utimes,
  writeFile,
} from 'node:fs/promises';
import * as fsPromises from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';

import type {
  ArtifactSnapshot,
  CommitGuard,
  CommitResult,
  FileOutput,
  OutputManifest,
  PageArtifact,
} from '../../contracts';
import { JsonArtifactCache, TransactionalOutputCommitter } from '..';

// The namespace of a Node built-in cannot be spied on, so the committer and these specs share a
// mutable copy of `node:fs/promises`: a spy on it sees the committer's calls.
vi.mock('node:fs/promises', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:fs/promises')>()),
}));

const roots: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function temporary(name: string): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), `${name}-`));
  roots.push(root);
  return root;
}

const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');

function output(file: string, content: string, role: FileOutput['role'] = 'content'): FileOutput {
  return { path: file, role, encoding: 'utf8', content, digest: digest(content) };
}

function artifact(id: string, outputs: FileOutput[]): PageArtifact {
  return {
    id,
    identity: { projectId: 'project-one', entryId: id, role: 'page-shell' },
    revision: `revision-${id}`,
    fingerprint: {
      schemaVersion: 4,
      compilerVersion: 'compiler-1',
      toolchainDigest: 'toolchain-1',
      configurationDigest: 'configuration-1',
      inputDigest: `input-${id}`,
      keywordDigest: 'keywords-1',
    },
    dependencies: [],
    content: [],
    exportedKeywords: [],
    usedKeywords: [],
    searchRecords: [],
    routes: [],
    apiList: [],
    outputs,
    diagnostics: [],
  };
}

/** Owner `id` publishes `files` (path → content); the output role follows the extension. */
function candidate(
  files: Record<string, Record<string, string>>,
  revision: string = 'snapshot',
): ArtifactSnapshot {
  return {
    projectId: 'project-one',
    revision,
    artifacts: Object.entries(files).map(([id, outputs]) =>
      artifact(
        id,
        Object.entries(outputs).map(([file, content]) =>
          output(file, content, file.endsWith('routes.ts') ? 'routes' : 'content'),
        ),
      ),
    ),
    globalKeywords: [],
    remoteKeywords: [],
  };
}

const current: CommitGuard = { isCurrent: () => true };

async function commit(
  committer: TransactionalOutputCommitter,
  generation: number,
  snapshot: ArtifactSnapshot,
  previous?: OutputManifest,
): Promise<CommitResult> {
  return committer.commit(
    { generation, candidate: snapshot, ...(previous ? { previous } : {}) },
    current,
    new AbortController().signal,
  );
}

function manifest(result: CommitResult): OutputManifest | undefined {
  return result.status === 'committed' ? result.manifest : undefined;
}

const realNow = Date.now.bind(Date);

/** Files written or compared before this point look settled to the racy-stat guard. */
function settleClock(): void {
  vi.spyOn(Date, 'now').mockImplementation(() => realNow() + 10_000);
}

/** Records which output files are read and which paths are resolved through realpath. */
function observeFileSystem(root: string) {
  const reads: string[] = [];
  const realpaths: string[] = [];
  const readFileOriginal = fsPromises.readFile;
  const realpathOriginal = fsPromises.realpath;
  vi.spyOn(fsPromises, 'readFile').mockImplementation(((
    file: Parameters<typeof readFileOriginal>[0],
    ...rest: unknown[]
  ) => {
    if (typeof file === 'string' && file.startsWith(root)) reads.push(path.relative(root, file));
    return (readFileOriginal as (...values: unknown[]) => unknown)(file, ...rest);
  }) as typeof readFileOriginal);
  vi.spyOn(fsPromises, 'realpath').mockImplementation(((
    file: Parameters<typeof realpathOriginal>[0],
    ...rest: unknown[]
  ) => {
    if (typeof file === 'string' && file.startsWith(root))
      realpaths.push(path.relative(root, file));
    return (realpathOriginal as (...values: unknown[]) => unknown)(file, ...rest);
  }) as typeof realpathOriginal);
  return { reads, realpaths };
}

async function tree(root: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  const walk = async (directory: string) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(file);
      else result[path.relative(root, file)] = await readFile(file, 'utf8');
    }
  };
  await walk(root);
  return result;
}

const pages = (overrides: Record<string, string> = {}) =>
  candidate({
    one: { 'guides/one/page.ts': 'one', 'guides/one/content.mjs': 'one body', ...overrides },
    two: { 'guides/two/page.ts': 'two', 'guides/two/content.mjs': 'two body' },
    aggregate: { 'routes.ts': 'routes' },
  });

test('after verification, unchanged outputs are neither read nor resolved; changed ones are', async () => {
  const root = await temporary('ng-doc-fast-commit');
  const committer = new TransactionalOutputCommitter({ outputRoot: root });
  const first = await commit(committer, 1, pages());
  expect(first).toMatchObject({ status: 'committed' });
  settleClock();
  // The first commit after publication compares bytes and records the verified stats.
  const verified = await commit(committer, 2, pages(), manifest(first));
  expect(verified).toMatchObject({ status: 'committed', written: [], removed: [] });

  const observed = observeFileSystem(root);
  const edited = await commit(
    committer,
    3,
    // Same size, so the changed output is read and compared rather than rejected by size.
    pages({ 'guides/one/content.mjs': 'one BODY' }),
    manifest(verified),
  );
  expect(edited).toMatchObject({
    status: 'committed',
    written: ['guides/one/content.mjs'],
    removed: [],
  });
  // Only the manifest and the changed output are read; only the changed output is resolved.
  expect([...new Set(observed.reads)].sort()).toEqual([
    '.ng-doc-output-manifest.json',
    'guides/one/content.mjs',
  ]);
  expect(observed.realpaths.filter((file) => file !== '')).toEqual(
    expect.arrayContaining(['guides', 'guides/one', 'guides/one/content.mjs']),
  );
  expect(observed.realpaths.some((file) => file.startsWith('guides/two'))).toBe(false);
  expect(await readFile(path.join(root, 'guides/one/content.mjs'), 'utf8')).toBe('one BODY');
});

test('a just-written or recently changed file is compared again (racy stat guard)', async () => {
  const root = await temporary('ng-doc-racy-commit');
  const committer = new TransactionalOutputCommitter({ outputRoot: root });
  const first = await commit(committer, 1, pages());
  // No settled clock: every file was changed within the racy window.
  const second = await commit(committer, 2, pages(), manifest(first));
  const observed = observeFileSystem(root);
  const third = await commit(committer, 3, pages(), manifest(second));
  expect(third).toMatchObject({ status: 'committed', written: [] });
  expect(observed.reads).toEqual(
    expect.arrayContaining(['guides/one/page.ts', 'guides/two/content.mjs', 'routes.ts']),
  );
});

test('external edits, deletions and replacements of verified outputs are repaired', async () => {
  const root = await temporary('ng-doc-repair-commit');
  const committer = new TransactionalOutputCommitter({ outputRoot: root });
  const first = await commit(committer, 1, pages());
  settleClock();
  let previous = manifest(await commit(committer, 2, pages(), manifest(first)));

  // Same size, different bytes, original timestamps restored: ctime still changes.
  const edited = path.join(root, 'guides/one/page.ts');
  const before = await stat(edited);
  await writeFile(edited, 'ONE');
  await utimes(edited, before.atime, before.mtime);
  // Deleted, and replaced through a rename (a new inode with identical bytes elsewhere).
  await rm(path.join(root, 'guides/two/page.ts'));
  await writeFile(path.join(root, 'replacement.tmp'), 'tampered body');
  await renameFile(path.join(root, 'replacement.tmp'), path.join(root, 'guides/two/content.mjs'));

  const repaired = await commit(committer, 3, pages(), previous);
  expect(repaired).toMatchObject({
    status: 'committed',
    written: ['guides/one/page.ts', 'guides/two/content.mjs', 'guides/two/page.ts'],
    removed: [],
  });
  previous = manifest(repaired);
  expect(await tree(root)).toEqual({
    '.ng-doc-output-manifest.json': expect.any(String),
    'guides/one/page.ts': 'one',
    'guides/one/content.mjs': 'one body',
    'guides/two/page.ts': 'two',
    'guides/two/content.mjs': 'two body',
    'routes.ts': 'routes',
  });
  // Repaired files are verified again rather than trusted.
  const observed = observeFileSystem(root);
  expect(await commit(committer, 4, pages(), previous)).toMatchObject({ written: [] });
  expect(observed.reads).toEqual(
    expect.arrayContaining(['guides/one/page.ts', 'guides/two/page.ts']),
  );
});

test('a symlinked parent of an unchanged verified output fails exactly like a fresh committer', async () => {
  const root = await temporary('ng-doc-symlink-commit');
  const outside = await temporary('ng-doc-symlink-outside');
  const committer = new TransactionalOutputCommitter({ outputRoot: root });
  const first = await commit(committer, 1, pages());
  settleClock();
  const previous = manifest(await commit(committer, 2, pages(), manifest(first)));
  // Move the directory out of the root (inodes and stats unchanged) and link it back in.
  await renameFile(path.join(root, 'guides/two'), path.join(outside, 'two'));
  await symlink(path.join(outside, 'two'), path.join(root, 'guides/two'));

  const fast = await commit(committer, 3, pages(), previous);
  const reference = await commit(
    new TransactionalOutputCommitter({ outputRoot: root }),
    3,
    pages(),
    previous,
  );
  expect(fast).toEqual(reference);
  expect(fast).toMatchObject({
    status: 'failed',
    diagnostics: [
      expect.objectContaining({
        code: 'OUTPUT_COMMIT_FAILED',
        message: `Output path contains a symlink: ${path.join(root, 'guides/two')}.`,
      }),
    ],
  });
});

test('unowned collisions, non-directory parents and non-file targets keep their diagnostics', async () => {
  const root = await temporary('ng-doc-probe-errors');
  const committer = new TransactionalOutputCommitter({ outputRoot: root });
  const first = await commit(committer, 1, pages());
  settleClock();
  const previous = manifest(await commit(committer, 2, pages(), manifest(first)));
  const compare = async (snapshot: ArtifactSnapshot) => {
    const fast = await commit(committer, 3, snapshot, previous);
    const reference = await commit(
      new TransactionalOutputCommitter({ outputRoot: root }),
      3,
      snapshot,
      previous,
    );
    expect(fast).toEqual(reference);
    return fast;
  };

  await writeFile(path.join(root, 'unowned.txt'), 'someone else');
  expect(await compare(pages({ 'unowned.txt': 'someone else' }))).toMatchObject({
    status: 'failed',
    diagnostics: [expect.objectContaining({ code: 'OUTPUT_UNOWNED_COLLISION' })],
  });
  expect(await compare(pages({ 'guides/one/page.ts/child.txt': 'x' }))).toMatchObject({
    status: 'failed',
    diagnostics: [
      expect.objectContaining({
        message: `Output parent is not a directory: ${path.join(root, 'guides/one/page.ts')}.`,
      }),
    ],
  });
  await mkdir(path.join(root, 'directory.txt'));
  expect(await compare(pages({ 'directory.txt': 'x' }))).toMatchObject({
    status: 'failed',
    diagnostics: [
      expect.objectContaining({
        message: `Output target is not a regular file: ${path.join(root, 'directory.txt')}.`,
      }),
    ],
  });
  // Nothing was published by the failed attempts.
  expect(await readFile(path.join(root, 'unowned.txt'), 'utf8')).toBe('someone else');
});

test('a failed commit rolls back and the next commit verifies every output again', async () => {
  const root = await temporary('ng-doc-rollback-commit');
  let fail = false;
  const committer = new TransactionalOutputCommitter({
    outputRoot: root,
    beforeMutation: (operation) => {
      if (fail && operation === 'publish-manifest') throw new Error('injected manifest fault');
    },
  });
  const first = await commit(committer, 1, pages());
  settleClock();
  const previous = manifest(await commit(committer, 2, pages(), manifest(first)));
  fail = true;
  const failed = await commit(
    committer,
    3,
    pages({ 'guides/one/content.mjs': 'changed' }),
    previous,
  );
  expect(failed).toMatchObject({ status: 'failed' });
  expect(await readFile(path.join(root, 'guides/one/content.mjs'), 'utf8')).toBe('one body');
  fail = false;
  const observed = observeFileSystem(root);
  expect(await commit(committer, 4, pages(), previous)).toMatchObject({
    status: 'committed',
    written: [],
  });
  expect(observed.reads).toEqual(
    expect.arrayContaining(['guides/one/page.ts', 'guides/two/page.ts', 'routes.ts']),
  );
});

test('differential: a long-lived committer equals fresh committers across edits, removals and tampering', async () => {
  const fastRoot = await temporary('ng-doc-diff-fast');
  const referenceRoot = await temporary('ng-doc-diff-reference');
  const fast = new TransactionalOutputCommitter({ outputRoot: fastRoot });
  settleClock();
  const steps: Array<{
    files: Record<string, Record<string, string>>;
    tamper?: (root: string) => Promise<void>;
  }> = [
    {
      files: {
        a: { 'a/page.ts': 'a1', 'a/body.mjs': 'a body' },
        b: { 'b/page.ts': 'b1' },
        agg: { 'routes.ts': 'r1' },
      },
    },
    {
      files: {
        a: { 'a/page.ts': 'a1', 'a/body.mjs': 'a body' },
        b: { 'b/page.ts': 'b1' },
        agg: { 'routes.ts': 'r1' },
      },
    },
    {
      files: {
        a: { 'a/page.ts': 'a2', 'a/body.mjs': 'a body' },
        b: { 'b/page.ts': 'b1' },
        agg: { 'routes.ts': 'r2' },
      },
    },
    {
      files: {
        a: { 'a/page.ts': 'a2', 'a/body.mjs': 'a body' },
        b: { 'b/page.ts': 'b1' },
        agg: { 'routes.ts': 'r2' },
      },
      tamper: async (root) => {
        await writeFile(path.join(root, 'a/body.mjs'), 'A BODY');
        await rm(path.join(root, 'b/page.ts'));
      },
    },
    {
      files: {
        a: { 'a/page.ts': 'a2', 'a/body.mjs': 'a body' },
        c: { 'c/new/page.ts': 'c1' },
        agg: { 'routes.ts': 'r3' },
      },
    },
    {
      files: {
        a: { 'a/page.ts': 'a2', 'a/body.mjs': 'a body' },
        c: { 'c/new/page.ts': 'c1' },
        agg: { 'routes.ts': 'r3' },
      },
    },
  ];
  let fastPrevious: OutputManifest | undefined;
  let referencePrevious: OutputManifest | undefined;
  for (const [index, step] of steps.entries()) {
    if (step.tamper) {
      await step.tamper(fastRoot);
      await step.tamper(referenceRoot);
    }
    const snapshot = candidate(step.files, `snapshot-${index}`);
    const fastResult = await commit(fast, index + 1, snapshot, fastPrevious);
    const referenceResult = await commit(
      new TransactionalOutputCommitter({ outputRoot: referenceRoot }),
      index + 1,
      snapshot,
      referencePrevious,
    );
    expect(fastResult).toEqual(referenceResult);
    expect(await tree(fastRoot)).toEqual(await tree(referenceRoot));
    fastPrevious = manifest(fastResult);
    referencePrevious = manifest(referenceResult);
  }
});

test('dispose forgets verification state', async () => {
  const root = await temporary('ng-doc-dispose-commit');
  const committer = new TransactionalOutputCommitter({ outputRoot: root });
  const first = await commit(committer, 1, pages());
  settleClock();
  await commit(committer, 2, pages(), manifest(first));
  expect((committer as unknown as { verified: Map<string, unknown> }).verified.size).toBe(5);
  await committer.dispose();
  expect((committer as unknown as { verified: Map<string, unknown> }).verified.size).toBe(0);
});

test('the racy guard measures from the clock reading taken before the stat', async () => {
  const root = await temporary('ng-doc-racy-clock');
  const committer = new TransactionalOutputCommitter({ outputRoot: root });
  const single = candidate({ one: { 'guides/one/page.ts': 'one' } });
  const first = await commit(committer, 1, single);
  // The clock jumps 10 s while the just-written output is read. It was changed within the
  // racy window before its stat, so it must not be recorded (a later reading would say it is).
  let offset = 0;
  vi.spyOn(Date, 'now').mockImplementation(() => realNow() + offset);
  const readFileOriginal = fsPromises.readFile;
  vi.spyOn(fsPromises, 'readFile').mockImplementation((async (...args: unknown[]) => {
    const result = await (readFileOriginal as (...values: unknown[]) => Promise<unknown>)(...args);
    if (args[0] === path.join(root, 'guides/one/page.ts')) offset = 10_000;
    return result;
  }) as typeof readFileOriginal);
  const second = await commit(committer, 2, single, manifest(first));
  expect(second).toMatchObject({ status: 'committed', written: [] });
  expect(offset).toBe(10_000);
  expect((committer as unknown as { verified: Map<string, unknown> }).verified.size).toBe(0);
});

/** A committer whose five outputs are verified, with the process clock 10 s ahead of the files. */
async function verifiedCommitter(root: string) {
  const committer = new TransactionalOutputCommitter({ outputRoot: root });
  const first = await commit(committer, 1, pages());
  settleClock();
  const second = await commit(committer, 2, pages(), manifest(first));
  expect(second).toMatchObject({ status: 'committed', written: [] });
  expect((committer as unknown as { verified: Map<string, unknown> }).verified.size).toBe(5);
  return { committer, previous: manifest(second)! };
}

test('clock skew: an immediate same-size in-place edit with mtime restored is repaired (ctime)', async () => {
  const root = await temporary('ng-doc-skew-commit');
  const { committer, previous } = await verifiedCommitter(root);
  const file = path.join(root, 'guides/one/content.mjs');
  const before = await stat(file);
  await writeFile(file, 'ONE BODY');
  await utimes(file, before.atime, before.mtime);
  expect(await commit(committer, 3, pages(), previous)).toMatchObject({
    status: 'committed',
    written: ['guides/one/content.mjs'],
  });
  expect(await readFile(file, 'utf8')).toBe('one body');
});

test('a verified output swapped for a symlink or a directory fails exactly like a fresh committer', async () => {
  for (const swap of ['symlink', 'directory'] as const) {
    const root = await temporary(`ng-doc-swap-${swap}`);
    const outside = await temporary(`ng-doc-swap-${swap}-outside`);
    const { committer, previous } = await verifiedCommitter(root);
    const target = path.join(root, 'guides/two/content.mjs');
    await rm(target);
    if (swap === 'symlink') {
      await writeFile(path.join(outside, 'content.mjs'), 'two body');
      await symlink(path.join(outside, 'content.mjs'), target);
    } else {
      await mkdir(target);
    }
    const fast = await commit(committer, 3, pages(), previous);
    const fresh = await commit(
      new TransactionalOutputCommitter({ outputRoot: root }),
      3,
      pages(),
      previous,
    );
    expect(fast).toEqual(fresh);
    expect(fast).toMatchObject({
      status: 'failed',
      diagnostics: [
        expect.objectContaining({
          message:
            swap === 'symlink'
              ? `Output path contains a symlink: ${target}.`
              : `Output target is not a regular file: ${target}.`,
        }),
      ],
    });
    expect(await readFile(path.join(outside, 'content.mjs'), 'utf8').catch(() => 'absent')).toBe(
      swap === 'symlink' ? 'two body' : 'absent',
    );
  }
});

test('a hard link to an outside file is accepted like a fresh committer; edits through it are repaired', async () => {
  const root = await temporary('ng-doc-hardlink-commit');
  const outside = await temporary('ng-doc-hardlink-outside');
  const { committer, previous } = await verifiedCommitter(root);
  const external = path.join(outside, 'shared.mjs');
  await writeFile(external, 'two body');
  await rm(path.join(root, 'guides/two/content.mjs'));
  await link(external, path.join(root, 'guides/two/content.mjs'));
  const accepted = await commit(committer, 3, pages(), previous);
  expect(accepted).toMatchObject({ status: 'committed', written: [] });
  await writeFile(external, 'TWO BODY');
  expect(await commit(committer, 4, pages(), manifest(accepted))).toMatchObject({
    status: 'committed',
    written: ['guides/two/content.mjs'],
  });
  expect(await readFile(path.join(root, 'guides/two/content.mjs'), 'utf8')).toBe('two body');
  expect(await readFile(external, 'utf8')).toBe('TWO BODY');
});

test('inode swaps before every commit keep the tree equal to the candidate', async () => {
  const root = await temporary('ng-doc-inode-swaps');
  const { committer, previous: start } = await verifiedCommitter(root);
  let previous: OutputManifest | undefined = start;
  for (const [index, snapshot] of [
    pages({ 'guides/one/content.mjs': 'one body 2' }),
    pages(),
    candidate({ one: { 'guides/one/page.ts': 'one' }, aggregate: { 'routes.ts': 'routes' } }),
    pages(),
  ].entries()) {
    // Same-size replacement through a new inode: the bytes are now wrong.
    await renameFile(path.join(root, 'guides/one/page.ts'), path.join(root, 'swap.tmp'));
    await writeFile(path.join(root, 'guides/one/page.ts'), 'two');
    await rm(path.join(root, 'swap.tmp'));
    const result = await commit(committer, 3 + index, snapshot, previous);
    expect(result.status).toBe('committed');
    const onDisk = await tree(root);
    delete onDisk['.ng-doc-output-manifest.json'];
    expect(onDisk).toEqual(
      Object.fromEntries(
        snapshot.artifacts.flatMap((item) => item.outputs).map((item) => [item.path, item.content]),
      ),
    );
    previous = manifest(result);
  }
});

test('cache stamps: identity with ctime, racy confirmation by bytes, settled trust and post-rename checks', async () => {
  const root = await temporary('ng-doc-cache-stamp');
  const cache = new JsonArtifactCache({ root });
  const value = artifact('stamped', [output('stamped/page.ts', 'stamped')]);
  const stamp = (await cache.writeStamped(value))!;
  expect(stamp).toEqual({
    dev: expect.stringMatching(/^\d+$/),
    ino: expect.stringMatching(/^\d+$/),
    size: String(`${JSON.stringify(value)}\n`.length),
    mtimeNs: expect.stringMatching(/^\d+$/),
    ctimeNs: expect.stringMatching(/^\d+$/),
    observedNs: expect.stringMatching(/^\d+$/),
  });
  const [project] = await readdir(root);
  const [name] = await readdir(path.join(root, project));
  const file = path.join(root, project, name);
  const bytes = await readFile(file, 'utf8');
  expect(bytes).toBe(`${JSON.stringify(value)}\n`);

  // A fresh (racy) stamp is confirmed by reading the bytes, and re-stamped.
  const reads: string[] = [];
  const readFileOriginal = fsPromises.readFile;
  vi.spyOn(fsPromises, 'readFile').mockImplementation(((target: string, ...rest: unknown[]) => {
    if (target === file) reads.push(target);
    return (readFileOriginal as (...values: unknown[]) => unknown)(target, ...rest);
  }) as typeof readFileOriginal);
  const confirmed = await cache.confirm(value, stamp);
  expect(confirmed).toMatchObject({ dev: stamp.dev, ino: stamp.ino, ctimeNs: stamp.ctimeNs });
  expect(reads).toHaveLength(1);
  // Same size, mtime restored: bytes differ, so a racy stamp is not confirmed.
  const before = await stat(file);
  await writeFile(file, bytes.replace('stamped', 'STAMPED'));
  await utimes(file, before.atime, before.mtime);
  expect(
    await cache.confirm(value, {
      ...stamp,
      ctimeNs: String((await stat(file, { bigint: true })).ctimeNs),
    }),
  ).toBeUndefined();

  // A settled stamp is trusted without reading; any later change (ctime) invalidates it.
  const rewritten = (await cache.writeStamped(value))!;
  settleClock();
  const settled = (await cache.confirm(value, rewritten))!;
  reads.splice(0);
  expect(await cache.confirm(value, settled)).toBe(settled);
  expect(reads).toEqual([]);
  const settledBefore = await stat(file);
  await writeFile(file, bytes.replace('stamped', 'STAMPED'));
  await utimes(file, settledBefore.atime, settledBefore.mtime);
  expect(await cache.confirm(value, settled)).toBeUndefined();
  expect(
    await cache.confirm(
      { ...value, id: 'other', identity: { ...value.identity, entryId: 'other' } },
      settled,
    ),
  ).toBeUndefined();
  await rm(file);
  expect(await cache.confirm(value, settled)).toBeUndefined();

  // `write` publishes identical bytes; an entry replaced right after the rename is not stamped.
  await cache.write(value);
  expect(await readFile(file, 'utf8')).toBe(bytes);
  const renameOriginal = fsPromises.rename;
  vi.spyOn(fsPromises, 'rename').mockImplementation((async (from: string, to: string) => {
    await (renameOriginal as (...values: unknown[]) => Promise<void>)(from, to);
    if (to === file) {
      await writeFile(`${file}.swap`, bytes);
      await (renameOriginal as (...values: unknown[]) => Promise<void>)(`${file}.swap`, file);
    }
  }) as typeof renameOriginal);
  expect(await cache.writeStamped(value)).toBeUndefined();
  vi.mocked(fsPromises.rename).mockRestore();
  expect(
    await cache.read({ identity: value.identity, fingerprint: value.fingerprint }),
  ).toMatchObject({ status: 'hit' });
});

/** A same-size in-place change with the original mtime restored (ctime still moves). */
async function tamperInPlace(file: string): Promise<void> {
  const before = await stat(file);
  const text = await readFile(file, 'utf8');
  await writeFile(file, text.replace('stamped', 'STAMPED'));
  await utimes(file, before.atime, before.mtime);
}

async function stampedEntry(root: string) {
  const cache = new JsonArtifactCache({ root });
  const value = artifact('stamped', [output('stamped/page.ts', 'stamped')]);
  await cache.write(value);
  const [project] = await readdir(root);
  const [name] = await readdir(path.join(root, project));
  return {
    cache,
    value,
    file: path.join(root, project, name),
    bytes: `${JSON.stringify(value)}\n`,
  };
}

test('cache stamps: a change after the rename followed by an event-loop stall is never trusted', async () => {
  const root = await temporary('ng-doc-stamp-stall-write');
  const { cache, value, file, bytes } = await stampedEntry(root);
  const renameOriginal = fsPromises.rename;
  vi.spyOn(fsPromises, 'rename').mockImplementation((async (from: string, to: string) => {
    await (renameOriginal as (...values: unknown[]) => Promise<void>)(from, to);
    if (to === file) {
      await tamperInPlace(file);
      settleClock(); // the process clock now reads 10 s later: a stall past the racy window
    }
  }) as typeof renameOriginal);
  const stamp = await cache.writeStamped(value);
  vi.mocked(fsPromises.rename).mockRestore();
  const trusted = stamp ? await cache.confirm(value, stamp) : undefined;
  expect(await readFile(file, 'utf8')).not.toBe(bytes);
  expect(trusted).toBeUndefined();
});

test('cache stamps: a change during a racy byte comparison followed by a stall is never trusted', async () => {
  const root = await temporary('ng-doc-stamp-stall-confirm');
  const { cache, value, file, bytes } = await stampedEntry(root);
  const stamp = (await cache.writeStamped(value))!;
  const readFileOriginal = fsPromises.readFile;
  let armed = true;
  vi.spyOn(fsPromises, 'readFile').mockImplementation((async (
    target: string,
    ...rest: unknown[]
  ) => {
    const result = await (readFileOriginal as (...values: unknown[]) => Promise<unknown>)(
      target,
      ...rest,
    );
    if (armed && target === file) {
      armed = false;
      await tamperInPlace(file);
      settleClock();
    }
    return result;
  }) as typeof readFileOriginal);
  const restamped = await cache.confirm(value, stamp);
  vi.mocked(fsPromises.readFile).mockRestore();
  const trusted = restamped ? await cache.confirm(value, restamped) : undefined;
  expect(await readFile(file, 'utf8')).not.toBe(bytes);
  expect(trusted).toBeUndefined();
  // Control: without a change, a racy stamp confirmed after the stall becomes settled.
  await cache.write(value);
  const fresh = (await cache.writeStamped(value))!;
  const settled = (await cache.confirm(value, fresh))!;
  expect(settled).toBeDefined();
  expect(await cache.confirm(value, settled)).toBe(settled);
});

test('an entry removed right after the rename yields no stamp and does not fail the write', async () => {
  const root = await temporary('ng-doc-stamp-vanished');
  const { cache, value, file } = await stampedEntry(root);
  const renameOriginal = fsPromises.rename;
  vi.spyOn(fsPromises, 'rename').mockImplementation((async (from: string, to: string) => {
    await (renameOriginal as (...values: unknown[]) => Promise<void>)(from, to);
    if (to === file) await rm(file); // e.g. another process pruning the cache
  }) as typeof renameOriginal);
  await expect(cache.writeStamped(value)).resolves.toBeUndefined();
  await expect(cache.write(value)).resolves.toBeUndefined();
  vi.mocked(fsPromises.rename).mockRestore();
  expect(await readdir(path.dirname(file))).toEqual([]);
  await cache.write(value);
  expect(
    await cache.read({ identity: value.identity, fingerprint: value.fingerprint }),
  ).toMatchObject({ status: 'hit' });
});

test('a full commit checks outputs concurrently but reports the first failing output in plan order', async () => {
  const root = await temporary('ng-doc-commit-order');
  const first = await commit(new TransactionalOutputCommitter({ outputRoot: root }), 1, pages());
  expect(first).toMatchObject({ status: 'committed' });
  const before = await tree(root);
  // The later output fails at once, the earlier one only after it: the earlier one is reported.
  const readFileOriginal = fsPromises.readFile;
  vi.spyOn(fsPromises, 'readFile').mockImplementation((async (
    file: Parameters<typeof readFileOriginal>[0],
    ...rest: unknown[]
  ) => {
    if (typeof file === 'string' && file.endsWith(path.join('two', 'content.mjs')))
      throw new Error('two is unreadable');
    if (typeof file === 'string' && file.endsWith(path.join('one', 'content.mjs'))) {
      await new Promise((done) => setTimeout(done, 20));
      throw new Error('one is unreadable');
    }
    return (readFileOriginal as (...values: unknown[]) => unknown)(file, ...rest);
  }) as typeof readFileOriginal);
  const failed = await commit(
    new TransactionalOutputCommitter({ outputRoot: root }),
    2,
    pages(),
    manifest(first),
  );
  expect(failed).toMatchObject({
    status: 'failed',
    diagnostics: [{ code: 'OUTPUT_COMMIT_FAILED', message: expect.stringContaining('one is') }],
  });
  vi.mocked(fsPromises.readFile).mockRestore();
  expect(await tree(root)).toEqual(before);
});
