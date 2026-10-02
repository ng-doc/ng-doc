/** @vitest-environment node */

import { createHash } from 'node:crypto';
import type { BigIntStats } from 'node:fs';
import {
  copyFile as copyFileTo,
  lstat,
  mkdtemp,
  readdir,
  readFile,
  rename as renameFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';

import type {
  ArtifactSnapshot,
  CommitGuard,
  CommitResult,
  FileOutput,
  OutputManifest,
  PageArtifact,
} from '../../contracts';
import { type OutputCommitterOptions, TransactionalOutputCommitter, WRITE_CONCURRENCY } from '..';

const MANIFEST = '.ng-doc-output-manifest.json';
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function temporary(name: string): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), `${name}-`));
  roots.push(root);
  return root;
}

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const pause = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

function output(file: string, content: string): FileOutput {
  const role: FileOutput['role'] = file.endsWith('routes.ts')
    ? 'routes'
    : file.endsWith('search.json')
      ? 'search'
      : 'content';
  return { path: file, role, encoding: 'utf8', content, digest: digest(content) };
}

function artifact(id: string, outputs: FileOutput[]): PageArtifact {
  return {
    id,
    identity: { projectId: 'project-one', entryId: id, role: 'page-shell' },
    revision: `revision-${id}-${digest(JSON.stringify(outputs)).slice(0, 8)}`,
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

/** Owner → its outputs (path → content), as one candidate. */
function candidate(
  files: Record<string, Record<string, string>>,
  revision: string,
): ArtifactSnapshot {
  return {
    projectId: 'project-one',
    revision,
    artifacts: Object.entries(files).map(([id, outputs]) =>
      artifact(
        id,
        Object.entries(outputs).map(([file, content]) => output(file, content)),
      ),
    ),
    globalKeywords: [],
    remoteKeywords: [],
  };
}

/** `count` pages below `directory`, each with two outputs, all with `content` in their bytes. */
function pages(directory: string, count: number, content: string): Record<string, string> {
  const files: Record<string, string> = {};
  for (let index = 0; index < count; index++) {
    const name = `${directory}/page-${String(index).padStart(3, '0')}`;
    files[`${name}/page.ts`] = `${content} page ${index}`;
    files[`${name}/content.json`] = `${content} content ${index}`;
  }
  return files;
}

const current: CommitGuard = { isCurrent: () => true };

function commit(
  committer: TransactionalOutputCommitter,
  generation: number,
  snapshot: ArtifactSnapshot,
  previous?: OutputManifest,
  signal: AbortSignal = new AbortController().signal,
): Promise<CommitResult> {
  return committer.commit(
    { generation, candidate: snapshot, ...(previous ? { previous } : {}) },
    current,
    signal,
  );
}

function manifestOf(result: CommitResult): OutputManifest {
  if (result.status !== 'committed') throw new Error(`not committed: ${JSON.stringify(result)}`);
  return result.manifest;
}

/** Every file below `root` (forward slashes) → its bytes, the stage directories included. */
async function tree(root: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  const walk = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(full);
      else
        files[path.relative(root, full).split(path.sep).join('/')] = await readFile(full, 'utf8');
    }
  };
  await walk(root);
  return Object.fromEntries(Object.entries(files).sort(([a], [b]) => (a < b ? -1 : 1)));
}

/** Every file below `root` → its identity and modification time, which an exact rollback keeps. */
async function identities(root: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const file of Object.keys(await tree(root))) {
    const info: BigIntStats = await lstat(path.join(root, file), { bigint: true });
    result[file] = `${info.ino}:${info.mtimeNs}:${info.size}`;
  }
  return result;
}

async function stages(root: string): Promise<string[]> {
  return (await readdir(root)).filter((entry) => entry.startsWith('.ng-doc-stage-'));
}

/**
 * A file system operation that counts the calls in flight. Each call waits a moment before the
 * real operation and `hold` ms after it, so concurrent calls overlap, and `fail` may reject a call
 * (`after` the real operation took effect, or before it, `delay` ms after the call).
 */
function counted<A extends unknown[]>(
  operation: (...args: A) => Promise<void>,
  fail?: (args: A) => { after: boolean; error: Error; delay?: number } | undefined,
  hold: number = 2,
) {
  const state = { inFlight: 0, max: 0, calls: 0, settledAfterResult: 0, resultReady: false };
  const wrapped = async (...args: A): Promise<void> => {
    state.calls++;
    state.inFlight++;
    state.max = Math.max(state.max, state.inFlight);
    try {
      const fault = fail?.(args);
      await pause(fault?.delay ?? 2);
      if (fault && !fault.after) throw fault.error;
      await operation(...args);
      await pause(hold);
      if (fault) throw fault.error;
    } finally {
      state.inFlight--;
      if (state.resultReady) state.settledAfterResult++;
    }
  };
  return { state, wrapped };
}

/** The first commit's tree: two directories of pages, a root page and a late routes output. */
const first = (): ArtifactSnapshot =>
  candidate(
    {
      guides: pages('guides', 30, 'one'),
      api: pages('api', 30, 'one'),
      root: { 'index.ts': 'index one', 'routes.ts': 'routes one' },
      assets: { 'assets/search.json': '[1]', 'assets/icon.svg': '<svg/>' },
    },
    'first',
  );

/**
 * The second commit: replaces most outputs in place, adds a new directory and a new file in an
 * existing directory, adds a late output in a new directory and removes a page directory.
 */
const second = (): ArtifactSnapshot => {
  const guides = pages('guides', 30, 'two');
  delete guides['guides/page-029/page.ts'];
  delete guides['guides/page-029/content.json'];
  return candidate(
    {
      guides,
      api: { ...pages('api', 30, 'one'), 'api/page-000/extra.json': 'extra' },
      fresh: pages('fresh', 25, 'two'),
      root: { 'index.ts': 'index two', 'routes.ts': 'routes two' },
      assets: { 'assets/search.json': '[2]', 'assets/icon.svg': '<svg/>' },
      late: { 'late/routes.ts': 'late routes', 'late/page.ts': 'late page' },
    },
    'second',
  );
};

/** A copy refused by the file system (a full volume): the backup moves the file away instead. */
const copyRefused = async (): Promise<never> => {
  throw Object.assign(new Error('no space left on device'), { code: 'ENOSPC' });
};

describe('parallel writes', () => {
  // The kill switch restores the sequential path, so both must publish the same tree and manifest.
  test.each([{ delta: true }, { delta: false }])(
    'publish the same tree, manifest and results as sequential writes (delta $delta)',
    async ({ delta }) => {
      const results: Array<{
        tree: Record<string, string>;
        results: Array<Omit<Extract<CommitResult, { status: 'committed' }>, 'diagnostics'>>;
        writes: number;
        copies: number;
      }> = [];
      for (const parallelWrites of [true, false]) {
        const root = await temporary(`ng-doc-parallel-${parallelWrites}`);
        const writes = counted((file: string, bytes: Buffer, options: { flag: string }) =>
          writeFile(file, bytes, options),
        );
        const copies = counted((from: string, to: string) => copyFileTo(from, to));
        const committer = new TransactionalOutputCommitter({
          outputRoot: root,
          delta,
          parallelWrites,
          fileSystem: {
            writeFile: writes.wrapped as unknown as typeof writeFile,
            copyFile: copies.wrapped,
          },
        });
        const steps: ArtifactSnapshot[] = [first(), second(), second(), first()];
        const committed = [];
        let previous: OutputManifest | undefined;
        for (const [index, step] of steps.entries()) {
          const result = await commit(committer, index + 1, step, previous);
          previous = manifestOf(result);
          const { diagnostics, ...rest } = result as Extract<CommitResult, { status: 'committed' }>;
          expect(diagnostics).toEqual([]);
          committed.push(rest);
          // The manifest is written last: it names exactly the files on disk.
          const files = await tree(root);
          expect(Object.keys(files).filter((file) => file !== MANIFEST)).toEqual(
            previous.files.map((file) => file.path).sort(),
          );
        }
        await committer.dispose();
        expect(await stages(root)).toEqual([]);
        results.push({
          tree: await tree(root),
          results: committed,
          writes: writes.state.max,
          copies: copies.state.max,
        });
      }
      const [parallel, sequential] = results;
      expect(parallel.tree).toEqual(sequential.tree);
      expect(parallel.results).toEqual(sequential.results);
      // The parallel path wrote and copied concurrently, the sequential one one at a time.
      expect(parallel.writes).toBe(WRITE_CONCURRENCY);
      expect(parallel.copies).toBe(WRITE_CONCURRENCY);
      expect(sequential.writes).toBe(1);
      expect(sequential.copies).toBe(1);
    },
  );

  test('keep at most WRITE_CONCURRENCY writes, directory creations and copies in flight', async () => {
    const root = await temporary('ng-doc-parallel-bound');
    const writes = counted((file: string, bytes: Buffer, options: { flag: string }) =>
      writeFile(file, bytes, options),
    );
    const copies = counted((from: string, to: string) => copyFileTo(from, to));
    const committer = new TransactionalOutputCommitter({
      outputRoot: root,
      fileSystem: {
        writeFile: writes.wrapped as unknown as typeof writeFile,
        copyFile: copies.wrapped,
      },
    });
    const files = pages('guides', 4 * WRITE_CONCURRENCY, 'one');
    const one = await commit(committer, 1, candidate({ guides: files }, 'one'));
    expect(writes.state.calls).toBe(Object.keys(files).length + 1);
    expect(writes.state.max).toBe(WRITE_CONCURRENCY);
    expect(copies.state.calls).toBe(0);
    await commit(
      committer,
      2,
      candidate({ guides: pages('guides', 4 * WRITE_CONCURRENCY, 'two') }, 'two'),
      manifestOf(one),
    );
    // Every replaced output and the manifest were backed up, at most the bound at a time.
    expect(copies.state.calls).toBe(Object.keys(files).length + 1);
    expect(copies.state.max).toBe(WRITE_CONCURRENCY);
    expect(writes.state.max).toBe(WRITE_CONCURRENCY);
    await committer.dispose();
  });

  // The same failures without parallel writes keep the guarantees of the sequential path, which
  // restores a replaced output from its backup, so only its bytes are the old ones.
  describe.each([{ parallelWrites: true }, { parallelWrites: false }])(
    'failures (parallel writes $parallelWrites)',
    ({ parallelWrites }) => {
      /**
       * A committed root with `files`, its manifest, its tree and identities, and a commit of the
       * next candidate through a committer with `options`.
       */
      async function faulted(
        name: string,
        options: Omit<OutputCommitterOptions, 'outputRoot'> & { parallelWrites: boolean },
      ) {
        const root = await temporary(name);
        const initial = new TransactionalOutputCommitter({ outputRoot: root });
        const previous = manifestOf(
          await commit(
            initial,
            1,
            candidate({ guides: pages('guides', 40, 'one'), root: { 'routes.ts': 'one' } }, 'one'),
          ),
        );
        await initial.dispose();
        const before = { tree: await tree(root), identities: await identities(root) };
        const committer = new TransactionalOutputCommitter({ outputRoot: root, ...options });
        const result = await commit(
          committer,
          2,
          candidate(
            {
              guides: pages('guides', 40, 'two'),
              fresh: pages('fresh', 20, 'two'),
              root: { 'routes.ts': 'two' },
            },
            'two',
          ),
          previous,
        );
        await committer.dispose();
        return { root, before, result };
      }

      /**
       * The root holds what it held before the failed commit: its bytes, and unless `untouched` is
       * false (outputs were replaced and restored from their backups), its inodes and mtimes.
       */
      async function expectExactRollback(
        root: string,
        before: { tree: Record<string, string>; identities: Record<string, string> },
        untouched: boolean = true,
      ) {
        expect(await stages(root)).toEqual([]);
        expect(await tree(root)).toEqual(before.tree);
        if (untouched) expect(await identities(root)).toEqual(before.identities);
      }

      test('a staging write failing mid-batch settles the writes in flight and leaves the old state', async () => {
        const writes = counted(
          (file: string, bytes: Buffer, options: { flag: string }) =>
            writeFile(file, bytes, options),
          ([file]) =>
            // Two failures in one batch, the later in plan order first: the reported one is still the
            // first in plan order, as in the sequential loop.
            file.endsWith(`${path.sep}page-007${path.sep}page.ts`)
              ? { after: true, delay: 0, error: new Error('injected write failure: page-007') }
              : file.endsWith(`${path.sep}page-003${path.sep}page.ts`)
                ? { after: false, delay: 30, error: new Error('injected write failure: page-003') }
                : undefined,
          // The writes in flight outlast a rollback that would not wait for them.
          25,
        );
        const { root, before, result } = await faulted('ng-doc-parallel-stage-fault', {
          parallelWrites,
          fileSystem: { writeFile: writes.wrapped as unknown as typeof writeFile },
        });
        writes.state.resultReady = true;
        expect(result).toMatchObject({
          status: 'failed',
          diagnostics: [
            { code: 'OUTPUT_COMMIT_FAILED', message: 'injected write failure: page-003' },
          ],
        });
        expect(writes.state.max).toBe(parallelWrites ? WRITE_CONCURRENCY : 1);
        // Nothing was still writing when the rollback removed the stage, and nothing writes later.
        expect(writes.state.inFlight).toBe(0);
        await pause(20);
        expect(writes.state.settledAfterResult).toBe(0);
        await expectExactRollback(root, before);
      });

      test.each([
        { fault: 'before', after: false },
        { fault: 'after', after: true },
      ])(
        'a backup copy failing $fault taking effect mid-batch leaves the old state',
        async ({ after }) => {
          const copies = counted(
            (from: string, to: string) => copyFileTo(from, to),
            ([from]) =>
              from.endsWith(`${path.sep}page-020${path.sep}content.json`)
                ? { after, delay: 0, error: new Error('injected copy failure') }
                : undefined,
            25,
          );
          const { root, before, result } = await faulted('ng-doc-parallel-copy-fault', {
            parallelWrites,
            fileSystem: { copyFile: copies.wrapped },
          });
          copies.state.resultReady = true;
          expect(result).toMatchObject({
            status: 'failed',
            diagnostics: [{ code: 'OUTPUT_COMMIT_FAILED', message: 'injected copy failure' }],
          });
          expect(copies.state.max).toBe(parallelWrites ? WRITE_CONCURRENCY : 1);
          expect(copies.state.inFlight).toBe(0);
          await pause(20);
          expect(copies.state.settledAfterResult).toBe(0);
          // In parallel, every backup is taken before the first publish, so nothing was replaced.
          await expectExactRollback(root, before, parallelWrites);
        },
      );

      test('a publish failing after the backups restores what it replaced', async () => {
        const published: string[] = [];
        const { root, before, result } = await faulted('ng-doc-parallel-publish-fault', {
          parallelWrites,
          fileSystem: {
            rename: async (from, to) => {
              const target = String(to);
              if (target.endsWith(`${path.sep}page-025${path.sep}page.ts`))
                throw new Error('injected publish failure');
              await renameFile(from, to);
              published.push(target);
            },
          },
        });
        expect(result).toMatchObject({
          status: 'failed',
          diagnostics: [{ code: 'OUTPUT_COMMIT_FAILED', message: 'injected publish failure' }],
        });
        // The failure came after the new directory and some replaced outputs were published.
        expect(published.some((file) => file.endsWith(`${path.sep}fresh`))).toBe(true);
        expect(published.some((file) => file.includes(`${path.sep}page-024${path.sep}`))).toBe(
          true,
        );
        const restored = await tree(root);
        expect(restored).toEqual(before.tree);
        expect(await stages(root)).toEqual([]);
        // An output it had not replaced yet is the very file it was.
        const after = await identities(root);
        expect(after['guides/page-030/page.ts']).toBe(before.identities['guides/page-030/page.ts']);
        expect(after[MANIFEST]).toBe(before.identities[MANIFEST]);
      });

      test('an abort while staging settles the writes in flight and publishes nothing', async () => {
        const controller = new AbortController();
        const writes = counted(
          (file: string, bytes: Buffer, options: { flag: string }) => {
            if (file.endsWith(`${path.sep}page-010${path.sep}page.ts`)) controller.abort();
            return writeFile(file, bytes, options);
          },
          undefined,
          25,
        );
        const root = await temporary('ng-doc-parallel-abort');
        const initial = new TransactionalOutputCommitter({ outputRoot: root });
        const previous = manifestOf(
          await commit(initial, 1, candidate({ guides: pages('guides', 40, 'one') }, 'one')),
        );
        await initial.dispose();
        const before = { tree: await tree(root), identities: await identities(root) };
        const committer = new TransactionalOutputCommitter({
          outputRoot: root,
          parallelWrites,
          fileSystem: { writeFile: writes.wrapped as unknown as typeof writeFile },
        });
        const result = await commit(
          committer,
          2,
          candidate({ guides: pages('guides', 40, 'two') }, 'two'),
          previous,
          controller.signal,
        );
        writes.state.resultReady = true;
        await committer.dispose();
        expect(result.status).toBe('stale');
        expect(writes.state.inFlight).toBe(0);
        // The writes stopped at the abort, well before the end of the batch.
        expect(writes.state.calls).toBeLessThan(80);
        await pause(20);
        expect(writes.state.settledAfterResult).toBe(0);
        await expectExactRollback(root, before);
      });
    },
  );

  test('a backup whose copy fails moves its output away right before that output is published', async () => {
    const root = await temporary('ng-doc-parallel-move');
    const initial = new TransactionalOutputCommitter({ outputRoot: root });
    const previous = manifestOf(
      await commit(initial, 1, candidate({ guides: pages('guides', 20, 'one') }, 'one')),
    );
    await initial.dispose();
    const renames: string[] = [];
    const committer = new TransactionalOutputCommitter({
      outputRoot: root,
      fileSystem: {
        copyFile: copyRefused,
        rename: async (from, to) => {
          await renameFile(from, to);
          const backup = String(to).includes(`${path.sep}backups${path.sep}`);
          const file = path.relative(root, backup ? String(from) : String(to));
          renames.push(`${backup ? 'move' : 'publish'} ${file.split(path.sep).join('/')}`);
        },
      },
    });
    const result = await commit(
      committer,
      2,
      candidate({ guides: pages('guides', 20, 'two') }, 'two'),
      previous,
    );
    await committer.dispose();
    expect(result.status).toBe('committed');
    const files = [...Object.keys(pages('guides', 20, 'two'))].sort();
    expect(renames).toEqual([
      ...files.flatMap((file) => [`move ${file}`, `publish ${file}`]),
      `move ${MANIFEST}`,
      `publish ${MANIFEST}`,
    ]);
    expect(await stages(root)).toEqual([]);
    expect(await readFile(path.join(root, 'guides/page-007/page.ts'), 'utf8')).toBe('two page 7');
  });
});
