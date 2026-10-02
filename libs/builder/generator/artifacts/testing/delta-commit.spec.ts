/** @vitest-environment node */

/**
 * The delta commit. A committer with delta commits (the default) and one with the kill switch
 * (`delta: false`, the full commit exactly as before) are driven through the same commit sequence;
 * results, output trees and manifest bytes must be identical at every step, and the delta arm must
 * have run the path each step names.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
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
import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  ArtifactSnapshot,
  CommitGuard,
  CommitResult,
  Dependency,
  FileOutput,
  OutputManifest,
  PageArtifact,
  PublishedGeneratorConfiguration,
} from '../../contracts';
import * as graph from '../../graph';
import { forwardSlashes, hostPath } from '../../kernel/paths';
import { type CommitMutation, type CommitTelemetry, TransactionalOutputCommitter } from '..';

// The namespace of a Node built-in cannot be spied on, so the committer and these specs share a
// mutable copy of `node:fs/promises`: a spy on it sees the committer's calls. The graph module is
// transformed by Vitest, and its namespace accepts spies as it is.
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
const current: CommitGuard = { isCurrent: () => true };
const realNow = Date.now.bind(Date);
/** A deep copy of JSON data. */
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

type Files = Record<string, Record<string, string>>;

interface Options {
  configuration?: PublishedGeneratorConfiguration;
  dependencies?: Record<string, Dependency[]>;
  roles?: Record<string, PageArtifact['identity']['role']>;
}

function output(file: string, content: string): FileOutput {
  const role = file.endsWith('routes.ts')
    ? 'routes'
    : file.endsWith('.json')
      ? 'search'
      : 'content';
  return { path: file, role, encoding: 'utf8', content, digest: digest(content) };
}

/** Owner `id` publishes `files` (path → content). An artifact's revision digests its body. */
function snapshot(files: Files, revision: string, options: Options = {}): ArtifactSnapshot {
  const artifacts = Object.entries(files).map(([id, outputs]): PageArtifact => {
    const body: PageArtifact = {
      id,
      identity: { projectId: 'project', entryId: id, role: options.roles?.[id] ?? 'page-shell' },
      revision: '',
      fingerprint: {
        schemaVersion: 4,
        compilerVersion: 'compiler',
        toolchainDigest: 'toolchain',
        configurationDigest: options.configuration?.digest ?? 'configuration',
        inputDigest: `input-${id}`,
        keywordDigest: 'keywords',
      },
      dependencies: options.dependencies?.[id] ?? [],
      content: [],
      exportedKeywords: [],
      usedKeywords: [],
      searchRecords: [],
      routes: [],
      apiList: [],
      outputs: Object.entries(outputs).map(([file, content]) => output(file, content)),
      diagnostics: [],
    };
    return { ...body, revision: digest(JSON.stringify(body)) };
  });
  return {
    ...(options.configuration ? { configuration: options.configuration } : {}),
    projectId: 'project',
    revision,
    artifacts,
    globalKeywords: [],
    remoteKeywords: [],
  };
}

async function tree(root: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  const walk = async (directory: string) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(file);
      else if (entry.isSymbolicLink())
        result[forwardSlashes(path.relative(root, file))] = '<symlink>';
      else result[forwardSlashes(path.relative(root, file))] = await readFile(file, 'utf8');
    }
  };
  await walk(root);
  return result;
}

/** Records which files under `root` the committer reads. */
function observeReads(root: string): string[] {
  const reads: string[] = [];
  const original = fsPromises.readFile;
  vi.spyOn(fsPromises, 'readFile').mockImplementation(((
    file: Parameters<typeof original>[0],
    ...rest: unknown[]
  ) => {
    if (typeof file === 'string' && file.startsWith(root))
      reads.push(forwardSlashes(path.relative(root, file)));
    return (original as (...values: unknown[]) => unknown)(file, ...rest);
  }) as typeof original);
  return reads;
}

/**
 * One committer and the caller state a session keeps: the committed snapshot and manifest of
 * the same commit (the base), passed with every request as the session does.
 */
class Arm {
  committer: TransactionalOutputCommitter;
  previous?: OutputManifest;
  base?: ArtifactSnapshot;
  fault?: CommitMutation;

  constructor(
    readonly root: string,
    readonly delta: boolean,
  ) {
    this.committer = this.create();
  }

  create(): TransactionalOutputCommitter {
    return new TransactionalOutputCommitter({
      outputRoot: this.root,
      delta: this.delta,
      beforeMutation: (operation) => {
        if (operation === this.fault) throw new Error(`injected ${operation} fault`);
      },
    });
  }

  async restart(): Promise<void> {
    await this.committer.dispose();
    this.committer = this.create();
  }

  async commit(
    generation: number,
    candidate: ArtifactSnapshot,
    options: { guard?: CommitGuard; base?: false } = {},
  ): Promise<CommitResult> {
    const result = await this.committer.commit(
      {
        generation,
        candidate,
        ...(this.previous ? { previous: clone(this.previous) } : {}),
        ...(this.previous && this.base && options.base !== false
          ? { base: { snapshot: this.base, manifest: clone(this.previous) } }
          : {}),
      },
      options.guard ?? current,
      new AbortController().signal,
    );
    if (result.status === 'committed') {
      this.previous = clone(result.manifest);
      this.base = candidate;
    }
    return result;
  }
}

async function pair(name: string) {
  const deltaRoot = await temporary(`${name}-delta`);
  const fullRoot = await temporary(`${name}-full`);
  return { delta: new Arm(deltaRoot, true), full: new Arm(fullRoot, false) };
}

const base: Files = {
  one: { 'guides/one/page.ts': 'one', 'guides/one/content.mjs': 'one body' },
  two: { 'guides/two/page.ts': 'two', 'guides/two/content.mjs': 'two body' },
  api: { 'api/list.ts': 'api list', 'api/entry.mjs': 'api entry' },
  aggregate: { 'routes.ts': 'routes 1', 'assets/indexes.json': '{"i":1}', 'index.ts': 'index' },
};
const edit = (files: Files, owner: string, file: string, content: string): Files => ({
  ...files,
  [owner]: { ...files[owner], [file]: content },
});

describe('delta commit', () => {
  it('differential: delta and full commits give identical results, trees and manifest bytes at every step', async () => {
    const { delta, full } = await pair('ng-doc-s4-diff');
    let files = base;
    const steps: Array<{
      label: string;
      files?: (files: Files) => Files;
      fault?: CommitMutation;
      stale?: boolean;
      restart?: boolean;
      expect: CommitTelemetry['mode'] | 'none';
      reason?: string;
      written?: string[];
      removed?: string[];
      status?: CommitResult['status'];
    }> = [
      { label: 'cold start', expect: 'full', reason: 'no-base', status: 'committed' },
      { label: 'no change (a new revision)', expect: 'delta', written: [] },
      {
        label: 'guide edit',
        files: (f) => edit(f, 'one', 'guides/one/content.mjs', 'one body 2'),
        expect: 'delta',
        written: ['guides/one/content.mjs'],
      },
      {
        label: 'include edit (two guides and the aggregate)',
        files: (f) =>
          edit(
            edit(
              edit(f, 'one', 'guides/one/content.mjs', 'shared 2'),
              'two',
              'guides/two/content.mjs',
              'shared 2',
            ),
            'aggregate',
            'assets/indexes.json',
            '{"i":2}',
          ),
        expect: 'delta',
        written: ['assets/indexes.json', 'guides/one/content.mjs', 'guides/two/content.mjs'],
      },
      {
        label: 'API edit',
        files: (f) =>
          edit(
            edit(f, 'api', 'api/entry.mjs', 'api entry 2'),
            'aggregate',
            'routes.ts',
            'routes 2',
          ),
        expect: 'delta',
        written: ['api/entry.mjs', 'routes.ts'],
      },
      {
        label: 'page added',
        files: (f) => ({
          ...f,
          three: { 'guides/three/page.ts': 'three', 'guides/three/content.mjs': 'three body' },
        }),
        expect: 'delta',
        written: ['guides/three/content.mjs', 'guides/three/page.ts'],
      },
      {
        label: 'page renamed (its outputs move)',
        files: ({ three, ...f }) => ({
          ...f,
          renamed: {
            'guides/renamed/page.ts': three['guides/three/page.ts'],
            'guides/renamed/content.mjs': 'three body',
          },
        }),
        expect: 'delta',
        written: ['guides/renamed/content.mjs', 'guides/renamed/page.ts'],
        removed: ['guides/three/content.mjs', 'guides/three/page.ts'],
      },
      {
        label: 'an output moves to another owner',
        files: (f) => {
          const { 'api/entry.mjs': moved, ...api } = f.api;
          return { ...f, api, two: { ...f.two, 'api/entry.mjs': moved } };
        },
        expect: 'delta',
        written: [],
      },
      {
        label: 'page deleted',
        files: ({ renamed: _renamed, ...f }) => f,
        expect: 'delta',
        written: [],
        removed: ['guides/renamed/content.mjs', 'guides/renamed/page.ts'],
      },
      {
        label: 'failed commit (publish fault)',
        files: (f) => edit(f, 'one', 'guides/one/page.ts', 'one 3'),
        fault: 'publish-output',
        expect: 'delta',
        status: 'failed',
      },
      {
        label: 'edit after the failed commit',
        files: (f) => edit(f, 'two', 'guides/two/page.ts', 'two 3'),
        expect: 'full',
        reason: 'untrusted',
        written: ['guides/one/page.ts', 'guides/two/page.ts'],
      },
      {
        label: 'stale commit',
        files: (f) => edit(f, 'one', 'guides/one/page.ts', 'one 4'),
        stale: true,
        expect: 'none',
        status: 'stale',
      },
      {
        label: 'edit after the stale commit',
        files: (f) => edit(f, 'two', 'guides/two/page.ts', 'two 4'),
        expect: 'full',
        reason: 'untrusted',
        written: ['guides/one/page.ts', 'guides/two/page.ts'],
      },
      {
        label: 'failed manifest publication (rolled back)',
        files: (f) => edit(f, 'one', 'guides/one/page.ts', 'one 5'),
        fault: 'publish-manifest',
        expect: 'delta',
        status: 'failed',
      },
      {
        label: 'edit after the manifest fault',
        files: (f) => edit(f, 'aggregate', 'routes.ts', 'routes 3'),
        expect: 'full',
        reason: 'untrusted',
        written: ['guides/one/page.ts', 'routes.ts'],
      },
      {
        label: 'committer restart',
        restart: true,
        files: (f) => edit(f, 'one', 'guides/one/content.mjs', 'one body 6'),
        expect: 'full',
        reason: 'untrusted',
        written: ['guides/one/content.mjs'],
      },
      {
        label: 'first edit after the restart',
        files: (f) => edit(f, 'two', 'guides/two/content.mjs', 'two body 7'),
        expect: 'delta',
        written: ['guides/two/content.mjs'],
      },
    ];
    for (const [index, step] of steps.entries()) {
      const generation = index + 1;
      if (step.files) files = step.files(files);
      const candidate = snapshot(files, `snapshot-${generation}`);
      for (const arm of [delta, full]) {
        arm.fault = step.fault;
        if (step.restart) await arm.restart();
      }
      const guard = step.stale ? { isCurrent: () => false } : current;
      const deltaResult = await delta.commit(generation, candidate, { guard });
      const fullResult = await full.commit(generation, candidate, { guard });
      expect({ step: step.label, result: deltaResult }).toEqual({
        step: step.label,
        result: fullResult,
      });
      expect({ step: step.label, tree: await tree(delta.root) }).toEqual({
        step: step.label,
        tree: await tree(full.root),
      });
      expect(deltaResult.status).toBe(step.status ?? 'committed');
      const telemetry = delta.committer.inspect();
      if (step.expect === 'none') expect(telemetry).toBeUndefined();
      else
        expect({ step: step.label, mode: telemetry?.mode, reason: telemetry?.reason }).toEqual({
          step: step.label,
          mode: step.expect,
          reason: step.reason,
        });
      expect(full.committer.inspect()?.reason).toBeUndefined();
      if (deltaResult.status === 'committed') {
        if (step.written)
          expect({ step: step.label, written: deltaResult.written }).toEqual({
            step: step.label,
            written: step.written,
          });
        expect(deltaResult.removed).toEqual(step.removed ?? []);
      }
    }
  });

  it('the first edit after a start that wrote every output reads only the changed outputs', async () => {
    const { delta, full } = await pair('ng-doc-s4-cold');
    const start = snapshot(base, 'start');
    await delta.commit(1, start);
    await full.commit(1, start);
    const changed = snapshot(edit(base, 'one', 'guides/one/content.mjs', 'one body 2'), 'edit');

    const deltaReads = observeReads(delta.root);
    expect(await delta.commit(2, changed)).toMatchObject({
      status: 'committed',
      written: ['guides/one/content.mjs'],
    });
    expect(delta.committer.inspect()).toEqual({ mode: 'delta', artifacts: 1, outputs: 2 });
    // Only the changed artifact's unchanged output (compared) and, at most, the published manifest
    // (the rewrite check). The changed output differs in size and is not read.
    expect(deltaReads.filter((file) => file !== '.ng-doc-output-manifest.json')).toEqual([
      'guides/one/page.ts',
    ]);

    vi.restoreAllMocks();
    const fullReads = observeReads(full.root);
    await full.commit(2, changed);
    // The kill switch: the full commit reads every output it wrote at the start again.
    expect(new Set(fullReads)).toEqual(
      new Set([
        ...Object.values(base)
          .flatMap(Object.keys)
          .filter((file) => file !== 'guides/one/content.mjs'),
        '.ng-doc-output-manifest.json',
      ]),
    );
    expect(await tree(delta.root)).toEqual(await tree(full.root));
  });

  it("a base that is not the committer's last publication commits in full, which rejects a stale previous", async () => {
    const { delta, full } = await pair('ng-doc-s4-n2');
    for (const arm of [delta, full]) {
      await arm.commit(1, snapshot(base, 'r1'));
    }
    const behind = { previous: delta.previous!, base: delta.base! };
    const fullBehind = { previous: full.previous!, base: full.base! };
    await delta.commit(2, snapshot(edit(base, 'one', 'guides/one/page.ts', 'one 2'), 'r2'));
    await full.commit(2, snapshot(edit(base, 'one', 'guides/one/page.ts', 'one 2'), 'r2'));
    expect(delta.committer.inspect()?.mode).toBe('delta');
    const before = await tree(delta.root);
    // The session is one generation behind its own disk (a commit it did not adopt).
    const third = snapshot(edit(base, 'two', 'guides/two/page.ts', 'two 3'), 'r3');
    const request = (arm: Arm, state: typeof behind) =>
      arm.committer.commit(
        {
          generation: 3,
          candidate: third,
          previous: state.previous,
          base: { snapshot: state.base, manifest: state.previous },
        },
        current,
        new AbortController().signal,
      );
    const deltaResult = await request(delta, behind);
    const fullResult = await request(full, fullBehind);
    expect(delta.committer.inspect()).toEqual({
      mode: 'full',
      reason: 'base-identity',
      artifacts: 0,
      outputs: 0,
    });
    expect(full.committer.inspect()).toEqual({ mode: 'full', artifacts: 0, outputs: 0 });
    expect(deltaResult).toEqual(fullResult);
    expect(deltaResult).toMatchObject({
      status: 'failed',
      diagnostics: [expect.objectContaining({ code: 'OUTPUT_MANIFEST_STALE' })],
    });
    expect(await tree(delta.root)).toEqual(before);

    // A base snapshot from another commit than its manifest (a mixed pair) is not trusted either.
    const mixed = await (async () => {
      const arm = new Arm(await temporary('ng-doc-s4-mixed'), true);
      await arm.commit(1, snapshot(base, 'm1'));
      await arm.commit(2, snapshot(edit(base, 'one', 'guides/one/page.ts', 'x'), 'm2'));
      const result = await arm.committer.commit(
        {
          generation: 3,
          candidate: snapshot(base, 'm3'),
          previous: arm.previous,
          base: { snapshot: snapshot(base, 'm1'), manifest: arm.previous! },
        },
        current,
        new AbortController().signal,
      );
      return { result, telemetry: arm.committer.inspect() };
    })();
    expect(mixed).toMatchObject({
      result: { status: 'committed' },
      telemetry: { mode: 'full', reason: 'base-identity' },
    });
  });

  it('falls back to the full commit for every listed reason and then reports exactly what the full commit reports', async () => {
    const { delta, full } = await pair('ng-doc-s4-fallback');
    let generation = 0;
    const both = async (candidate: ArtifactSnapshot, options: { base?: false } = {}) => {
      generation += 1;
      const deltaResult = await delta.commit(generation, candidate, options);
      const fullResult = await full.commit(generation, candidate, options);
      // Diagnostics name absolute paths under each arm's own root, JSON-escaped like the rest of
      // the result (a Windows root's backslashes are doubled).
      const rooted = (result: CommitResult, root: string) =>
        JSON.stringify(result).replaceAll(JSON.stringify(root).slice(1, -1), '<root>');
      expect(rooted(deltaResult, delta.root)).toBe(rooted(fullResult, full.root));
      expect(await tree(delta.root)).toEqual(await tree(full.root));
      return { result: deltaResult, telemetry: delta.committer.inspect() };
    };
    await both(snapshot(base, 'f1'));
    expect(await both(snapshot(base, 'f2'), { base: false })).toMatchObject({
      telemetry: { mode: 'full', reason: 'no-base' },
    });
    expect(await both(snapshot(base, 'f3'))).toMatchObject({ telemetry: { mode: 'delta' } });

    // Invalid changed artifact (content does not match its digest): the full path's diagnostic.
    const corrupt = snapshot(edit(base, 'one', 'guides/one/page.ts', 'one 4'), 'f4');
    corrupt.artifacts[0].outputs[1] = { ...corrupt.artifacts[0].outputs[1], content: 'tampered' };
    expect(await both(corrupt)).toMatchObject({
      result: {
        status: 'failed',
        diagnostics: [expect.objectContaining({ code: 'OUTPUT_CANDIDATE_INVALID' })],
      },
      telemetry: { mode: 'full', reason: 'candidate' },
    });
    await both(snapshot(base, 'f5'));
    // A changed artifact claims an unchanged artifact's path.
    expect(await both(snapshot(edit(base, 'one', 'guides/two/page.ts', 'x'), 'f6'))).toMatchObject({
      result: {
        status: 'failed',
        diagnostics: [expect.objectContaining({ code: 'OUTPUT_PATH_COLLISION' })],
      },
      telemetry: { mode: 'full', reason: 'candidate' },
    });
    await both(snapshot(base, 'f7'));
    // A new path that someone else owns on disk.
    for (const root of [delta.root, full.root])
      await writeFile(path.join(root, 'unowned.txt'), 'user');
    expect(await both(snapshot(edit(base, 'one', 'unowned.txt', 'mine'), 'f8'))).toMatchObject({
      result: {
        status: 'failed',
        diagnostics: [expect.objectContaining({ code: 'OUTPUT_UNOWNED_COLLISION' })],
      },
      telemetry: { mode: 'full', reason: 'targets' },
    });
    await both(snapshot(base, 'f9'));
    // A symlinked parent of a changed output.
    const outside = await temporary('ng-doc-s4-outside');
    for (const root of [delta.root, full.root]) {
      await rm(path.join(root, 'guides/two'), { recursive: true });
      await symlink(outside, path.join(root, 'guides/two'));
    }
    const linked = await both(snapshot(edit(base, 'two', 'guides/two/page.ts', 'two 10'), 'f10'));
    expect(linked.telemetry).toEqual({ mode: 'full', reason: 'targets', artifacts: 4, outputs: 9 });
    expect(linked.result.status).toBe('failed');
    for (const root of [delta.root, full.root]) await rm(path.join(root, 'guides/two'));
    await both(snapshot(base, 'f11'), { base: false });
    expect(await both(snapshot(base, 'f12'))).toMatchObject({ telemetry: { mode: 'delta' } });
    // The published manifest changed on disk (identical bytes, a new inode): not trusted.
    for (const root of [delta.root, full.root]) {
      const manifest = path.join(root, '.ng-doc-output-manifest.json');
      const bytes = await readFile(manifest);
      await rm(manifest);
      await writeFile(manifest, bytes);
    }
    expect(await both(snapshot(base, 'f13'))).toMatchObject({
      result: { status: 'committed' },
      telemetry: { mode: 'full', reason: 'manifest-stamp' },
    });
    // A manifest edited in place with its timestamps restored still has a new ctime.
    for (const root of [delta.root, full.root]) {
      const manifest = path.join(root, '.ng-doc-output-manifest.json');
      const bytes = await readFile(manifest, 'utf8');
      await writeFile(manifest, bytes.replace('"generation": 13', '"generation": 99'));
      await utimes(manifest, new Date(0), new Date(0));
    }
    expect(await both(snapshot(base, 'f14'))).toMatchObject({
      result: {
        status: 'failed',
        diagnostics: [expect.objectContaining({ code: 'OUTPUT_MANIFEST_STALE' })],
      },
      telemetry: { reason: 'manifest-stamp' },
    });
  });

  it('a configuration change or a malformed top level falls back to the full commit', async () => {
    const root = await temporary('ng-doc-s4-configuration');
    // A published configuration spells its roots as the engine does (forward slashes on Windows).
    const configuration = (value: string): PublishedGeneratorConfiguration => ({
      outputRoot: hostPath(root),
      cacheRoot: hostPath(path.join(root, 'cache')),
      assetDirectory: 'assets',
      themes: { light: 'light', dark: 'dark' },
      digest: value,
    });
    const arm = new Arm(root, true);
    await arm.commit(1, snapshot(base, 'c1', { configuration: configuration('one') }));
    await arm.commit(2, snapshot(base, 'c2', { configuration: configuration('one') }));
    expect(arm.committer.inspect()).toMatchObject({ mode: 'delta', artifacts: 0 });
    await arm.commit(3, snapshot(base, 'c3', { configuration: configuration('two') }));
    expect(arm.committer.inspect()).toMatchObject({ mode: 'full', reason: 'configuration' });
    // Another publication root in the configuration: the full commit's diagnostic.
    const moved = snapshot(base, 'c4', {
      configuration: {
        ...configuration('two'),
        outputRoot: hostPath(path.join(root, 'elsewhere')),
      },
    });
    expect(await arm.commit(4, moved)).toMatchObject({
      status: 'failed',
      diagnostics: [expect.objectContaining({ code: 'OUTPUT_CONFIGURATION_ROOT' })],
    });
    expect(arm.committer.inspect()).toMatchObject({ mode: 'full', reason: 'candidate' });
    await arm.commit(5, snapshot(base, 'c5', { configuration: configuration('two') }));
    expect(arm.committer.inspect()).toMatchObject({ mode: 'full', reason: 'untrusted' });
    const extra = {
      ...snapshot(base, 'c6', { configuration: configuration('two') }),
      unexpected: true,
    } as ArtifactSnapshot;
    expect(await arm.commit(6, extra)).toMatchObject({
      status: 'failed',
      diagnostics: [expect.objectContaining({ code: 'OUTPUT_CANDIDATE_INVALID' })],
    });
    expect(arm.committer.inspect()).toMatchObject({ reason: 'candidate' });
    await arm.commit(7, snapshot(base, 'c7', { configuration: configuration('two') }));
    const duplicate = snapshot(base, 'c8', { configuration: configuration('two') });
    duplicate.artifacts.push(duplicate.artifacts[0]);
    expect(await arm.commit(8, duplicate)).toMatchObject({
      status: 'failed',
      diagnostics: [expect.objectContaining({ code: 'OUTPUT_ARTIFACT_COLLISION' })],
    });
    expect(arm.committer.inspect()).toMatchObject({ reason: 'candidate' });
  });

  it('an external edit or deletion of an unchanged output is not repaired by a delta commit, only by a full one', async () => {
    const { delta, full } = await pair('ng-doc-s4-q3');
    for (const arm of [delta, full]) await arm.commit(1, snapshot(base, 'q1'));
    for (const arm of [delta, full]) {
      await writeFile(path.join(arm.root, 'guides/two/page.ts'), 'EDITED');
      await rm(path.join(arm.root, 'api/list.ts'));
    }
    const edited = snapshot(edit(base, 'one', 'guides/one/page.ts', 'one 2'), 'q2');
    await delta.commit(2, edited);
    await full.commit(2, edited);
    expect(delta.committer.inspect()?.mode).toBe('delta');
    const deltaTree = await tree(delta.root);
    const fullTree = await tree(full.root);
    // The documented difference, and nothing else.
    expect(deltaTree['guides/two/page.ts']).toBe('EDITED');
    expect(deltaTree['api/list.ts']).toBeUndefined();
    expect(fullTree['guides/two/page.ts']).toBe('two');
    expect(fullTree['api/list.ts']).toBe('api list');
    const { ['guides/two/page.ts']: _a, ['api/list.ts']: _b, ...deltaRest } = deltaTree;
    const { ['guides/two/page.ts']: _c, ['api/list.ts']: _d, ...fullRest } = fullTree;
    expect(deltaRest).toEqual(fullRest);
    // A full commit (the session omits the base for output-missing, reconciles and full builds).
    await delta.commit(3, snapshot(base, 'q3'), { base: false });
    await full.commit(3, snapshot(base, 'q3'), { base: false });
    expect(await tree(delta.root)).toEqual(await tree(full.root));
  });

  it('the kill switch ignores the base and forgets published outputs', async () => {
    const root = await temporary('ng-doc-s4-kill');
    const arm = new Arm(root, false);
    await arm.commit(1, snapshot(base, 'k1'));
    const reads = observeReads(root);
    await arm.commit(2, snapshot(base, 'k2'));
    expect(arm.committer.inspect()).toEqual({ mode: 'full', artifacts: 4, outputs: 9 });
    expect(reads).toContain('.ng-doc-output-manifest.json');
    expect(reads).toContain('guides/two/page.ts');
    const internals = arm.committer as unknown as { published?: unknown };
    expect(internals.published).toBeUndefined();
  });

  it('post-publish verification: a published output whose stat is outside the racy window stays verified for a full commit', async () => {
    const root = await temporary('ng-doc-s4-cut4');
    let offset = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => realNow() + offset);
    const committer = new TransactionalOutputCommitter({
      outputRoot: root,
      // The clock moves 10 s between the publish renames and the stats taken after them.
      beforeMutation: (operation) => {
        if (operation === 'publish-manifest') offset += 10_000;
      },
    });
    const first = await committer.commit(
      { generation: 1, candidate: snapshot(base, 'x1') },
      current,
      new AbortController().signal,
    );
    expect(first.status).toBe('committed');
    const verified = (committer as unknown as { verified: Map<string, unknown> }).verified;
    expect(verified.size).toBe(9);
    const reads = observeReads(root);
    // A full commit (no base): the published outputs are not read again.
    const second = await committer.commit(
      {
        generation: 2,
        candidate: snapshot(base, 'x2'),
        previous: (first as { manifest: OutputManifest }).manifest,
      },
      current,
      new AbortController().signal,
    );
    expect(second).toMatchObject({ status: 'committed', written: [] });
    expect(reads).toEqual(['.ng-doc-output-manifest.json', '.ng-doc-output-manifest.json']);

    // Without the clock jump every published output is inside the racy window: none is recorded.
    const racyRoot = await temporary('ng-doc-s4-cut4-racy');
    const racy = new TransactionalOutputCommitter({ outputRoot: racyRoot });
    await racy.commit(
      { generation: 1, candidate: snapshot(base, 'y1') },
      current,
      new AbortController().signal,
    );
    expect((racy as unknown as { verified: Map<string, unknown> }).verified.size).toBe(0);
  });

  it('paths that compare equal are left to the full commit', async () => {
    const { delta, full } = await pair('ng-doc-s4-ties');
    // Distinct file names that localeCompare orders as equal (a soft hyphen is ignorable).
    const composed = 'guides/ab.ts';
    const decomposed = 'guides/a\u00adb.ts';
    expect(composed.localeCompare(decomposed)).toBe(0);
    let generation = 0;
    const both = async (files: Files) => {
      generation += 1;
      const candidate = snapshot(files, `t${generation}`);
      const result = await delta.commit(generation, candidate);
      expect(result).toEqual(await full.commit(generation, candidate));
      expect(await tree(delta.root)).toEqual(await tree(full.root));
      return delta.committer.inspect();
    };
    await both(base);
    expect(
      await both({ ...base, left: { [composed]: 'a' }, right: { [decomposed]: 'b' } }),
    ).toMatchObject({ mode: 'full', reason: 'candidate' });
    // The published manifest has a tie, so the next commit is full as well.
    expect(
      await both({
        ...base,
        left: { [composed]: 'a' },
        right: { [decomposed]: 'b' },
        one: { 'guides/one/page.ts': 'x' },
      }),
    ).toMatchObject({ mode: 'full', reason: 'candidate' });
    expect(await both({ ...base, left: { [composed]: 'a2' } })).toMatchObject({
      mode: 'full',
      reason: 'candidate',
    });
    expect(await both({ ...base, left: { [composed]: 'a3' } })).toMatchObject({ mode: 'delta' });
    // A new path equal to a published one.
    expect(
      await both({ ...base, left: { [composed]: 'a3' }, right: { [decomposed]: 'b' } }),
    ).toMatchObject({ mode: 'full', reason: 'candidate' });
  });

  it('validates semantic scopes over the whole candidate only when definitions or references change', async () => {
    const { delta, full } = await pair('ng-doc-s4-scopes');
    const definition = (value: string): Dependency => ({
      kind: 'semantic',
      scopeId: 'program',
      digest: value,
      files: ['/src/a.ts'],
      reason: 'program',
    });
    const reference = (value: string): Dependency => ({
      kind: 'semantic-reference',
      scopeId: 'program',
      digest: value,
      reason: 'api',
    });
    const options = (
      aggregate: string,
      one: string,
      extra: Record<string, Dependency[]> = {},
    ): Options => ({
      roles: { aggregate: 'aggregate' },
      dependencies: { aggregate: [definition(aggregate)], one: [reference(one)], ...extra },
    });
    const validate = vi.spyOn(graph, 'validateSemanticScopes');
    let generation = 0;
    const both = async (files: Files, value: Options) => {
      generation += 1;
      const candidate = snapshot(files, `s${generation}`, value);
      validate.mockClear();
      const result = await delta.commit(generation, candidate);
      const calls = validate.mock.calls.length;
      expect(result).toEqual(await full.commit(generation, candidate));
      expect(await tree(delta.root)).toEqual(await tree(full.root));
      return { result, telemetry: delta.committer.inspect(), calls };
    };
    await both(base, options('d1', 'd1'));
    // A content edit that keeps every reference: no validation.
    expect(
      await both(edit(base, 'one', 'guides/one/page.ts', 'one 2'), options('d1', 'd1')),
    ).toMatchObject({ telemetry: { mode: 'delta' }, calls: 0 });
    // The aggregate's definitions change together with the reference: validated, valid.
    expect(
      await both(edit(base, 'aggregate', 'routes.ts', 'r2'), options('d2', 'd2')),
    ).toMatchObject({ result: { status: 'committed' }, telemetry: { mode: 'delta' }, calls: 1 });
    // A changed reference that no longer matches: the full commit's diagnostic.
    expect(
      await both(edit(base, 'one', 'guides/one/page.ts', 'one 3'), options('d2', 'stale')),
    ).toMatchObject({
      result: {
        status: 'failed',
        diagnostics: [expect.objectContaining({ code: 'GRAPH_SEMANTIC_SCOPE_STALE' })],
      },
      telemetry: { mode: 'full', reason: 'candidate' },
    });
    await both(base, options('d2', 'd2'));
    // A new artifact with a reference is validated; one without is not.
    expect(
      await both(
        { ...base, extra: { 'extra.ts': 'x' } },
        options('d2', 'd2', { extra: [reference('d2')] }),
      ),
    ).toMatchObject({ telemetry: { mode: 'delta' }, calls: 1 });
    expect(
      await both(
        { ...base, extra: { 'extra.ts': 'x' }, plain: { 'plain.ts': 'p' } },
        options('d2', 'd2', { extra: [reference('d2')] }),
      ),
    ).toMatchObject({ telemetry: { mode: 'delta' }, calls: 0 });
    // Removing the aggregate is validated (its references lose their definition).
    const withAggregate: Files = {
      ...base,
      extra: { 'extra.ts': 'x' },
      plain: { 'plain.ts': 'p' },
    };
    const { aggregate: _aggregate, ...withoutAggregate } = withAggregate;
    expect(
      await both(withoutAggregate, options('d2', 'd2', { extra: [reference('d2')] })),
    ).toMatchObject({
      result: {
        status: 'failed',
        diagnostics: [expect.objectContaining({ code: 'GRAPH_SEMANTIC_SCOPE_MISSING' })],
      },
      telemetry: { reason: 'candidate' },
    });
  });

  it('any other commit call ends the trust in a publication', async () => {
    const root = await temporary('ng-doc-s4-calls');
    let release!: () => void;
    let hold = false;
    const arrived = new Promise<void>((resolve) => {
      release = resolve;
    });
    let reached!: () => void;
    const holding = new Promise<void>((resolve) => {
      reached = resolve;
    });
    const committer = new TransactionalOutputCommitter({
      outputRoot: root,
      beforeMutation: async (operation) => {
        if (hold && operation === 'publish-manifest') {
          reached();
          await arrived;
        }
      },
    });
    const arm = new Arm(root, true);
    arm.committer = committer;
    await arm.commit(1, snapshot(base, 'a1'));
    hold = true;
    const pending = arm.commit(2, snapshot(edit(base, 'one', 'guides/one/page.ts', 'x'), 'a2'));
    await holding;
    // A call while another is active is rejected, and still ends the trust.
    expect(
      await committer.commit(
        { generation: 3, candidate: snapshot(base, 'a3') },
        current,
        new AbortController().signal,
      ),
    ).toMatchObject({
      status: 'failed',
      diagnostics: [expect.objectContaining({ code: 'OUTPUT_COMMIT_IN_PROGRESS' })],
    });
    hold = false;
    release();
    expect(await pending).toMatchObject({ status: 'committed' });
    await arm.commit(4, snapshot(base, 'a4'));
    expect(committer.inspect()).toMatchObject({ mode: 'full', reason: 'untrusted' });
    await arm.commit(5, snapshot(base, 'a5'));
    expect(committer.inspect()).toMatchObject({ mode: 'delta' });
    await committer.dispose();
    expect(await arm.commit(6, snapshot(base, 'a6'))).toMatchObject({
      diagnostics: [expect.objectContaining({ code: 'OUTPUT_COMMITTER_DISPOSED' })],
    });
    // A new committer over the same outputs trusts nothing yet.
    arm.committer = new TransactionalOutputCommitter({ outputRoot: root });
    await arm.commit(7, snapshot(base, 'a7'));
    expect(arm.committer.inspect()).toMatchObject({ mode: 'full', reason: 'untrusted' });
  });

  /** Both arms through `run`; returns their results, trees and delta-arm telemetry by arm. */
  async function arms(name: string, run: (arm: Arm, root: string) => Promise<unknown>) {
    const observed: Record<'delta' | 'full', { value: unknown; tree: Record<string, string> }> =
      {} as never;
    for (const delta of [true, false]) {
      const root = await temporary(`${name}-${delta ? 'delta' : 'full'}`);
      const value = await run(new Arm(root, delta), root);
      vi.restoreAllMocks();
      const files = await tree(root);
      observed[delta ? 'delta' : 'full'] = {
        value: JSON.parse(JSON.stringify(value).split(root).join('<root>')),
        tree: Object.fromEntries(
          Object.entries(files).filter(([file]) => !file.startsWith('.ng-doc-stage-')),
        ),
      };
    }
    return observed;
  }

  it('post-publish verification records an output only while it is still the file this commit wrote', async () => {
    // A commit tail longer than the racy window: an external writer rewrites one published output
    // in place, and another replaces one (a new inode with the original mtime), then the clock moves.
    const observed = await arms('ng-doc-s4-cut4-tail', async (arm, root) => {
      let offset = 0;
      let injected = false;
      vi.spyOn(Date, 'now').mockImplementation(() => realNow() + offset);
      arm.committer = new TransactionalOutputCommitter({
        outputRoot: root,
        delta: arm.delta,
        beforeMutation: async (operation: CommitMutation) => {
          if (operation !== 'publish-manifest' || injected) return;
          injected = true;
          await writeFile(path.join(root, 'guides/one/page.ts'), 'EXT');
          const replaced = path.join(root, 'guides/two/page.ts');
          const before = await stat(replaced);
          await writeFile(`${replaced}.tmp`, 'XYZ');
          await utimes(`${replaced}.tmp`, before.atime, before.mtime);
          await renameFile(`${replaced}.tmp`, replaced);
          offset += 10_000;
        },
      });
      const first = await arm.commit(1, snapshot(base, 'x1'));
      const recorded = [
        ...(arm.committer as unknown as { verified: Map<string, unknown> }).verified.keys(),
      ].sort();
      // A full commit (no base): the commit that repairs external edits.
      const second = await arm.commit(2, snapshot(base, 'x2'), { base: false });
      return { first: first.status, recorded, second };
    });
    expect(observed.delta.value).toEqual({
      first: 'committed',
      recorded: [
        'api/entry.mjs',
        'api/list.ts',
        'assets/indexes.json',
        'guides/one/content.mjs',
        'guides/two/content.mjs',
        'index.ts',
        'routes.ts',
      ],
      second: expect.objectContaining({
        status: 'committed',
        written: ['guides/one/page.ts', 'guides/two/page.ts'],
      }),
    });
    expect({ ...(observed.delta.value as object), recorded: [] }).toEqual({
      ...(observed.full.value as object),
      recorded: [],
    });
    expect(observed.delta.tree).toEqual(observed.full.tree);
    expect(observed.delta.tree['guides/one/page.ts']).toBe('one');
  });

  it("a manifest another writer publishes right after this commit's never becomes a delta base", async () => {
    const observed = await arms('ng-doc-s4-manifest-writer', async (arm, root) => {
      await arm.commit(1, snapshot(base, 'b1'));
      let inject = true;
      const originalRm = fsPromises.rm;
      vi.spyOn(fsPromises, 'rm').mockImplementation((async (
        target: Parameters<typeof originalRm>[0],
        options?: Parameters<typeof originalRm>[1],
      ) => {
        if (
          inject &&
          typeof target === 'string' &&
          path.basename(target).startsWith('.ng-doc-stage-')
        ) {
          inject = false;
          // A production build into the same output root publishes its own output and manifest.
          const manifestPath = path.join(root, '.ng-doc-output-manifest.json');
          const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as OutputManifest;
          await writeFile(path.join(root, 'prod-only.js'), 'prod');
          manifest.generation = 99;
          manifest.revision = 'other-writer';
          manifest.files = [
            ...manifest.files,
            {
              path: 'prod-only.js',
              ownerId: 'aggregate',
              digest: digest('prod'),
              role: 'content' as const,
            },
          ].sort((left, right) => left.path.localeCompare(right.path));
          await writeFile(`${manifestPath}.tmp`, `${JSON.stringify(manifest, null, 2)}\n`);
          await renameFile(`${manifestPath}.tmp`, manifestPath);
        }
        return originalRm(target, options);
      }) as typeof originalRm);
      const second = await arm.commit(
        2,
        snapshot(edit(base, 'one', 'guides/one/page.ts', 'one 2'), 'b2'),
      );
      vi.restoreAllMocks();
      const third = await arm.commit(
        3,
        snapshot(
          edit(
            edit(base, 'one', 'guides/one/page.ts', 'one 2'),
            'two',
            'guides/two/page.ts',
            'two 3',
          ),
          'b3',
        ),
      );
      return {
        second: second.status,
        third,
        telemetry: arm.delta ? arm.committer.inspect() : undefined,
      };
    });
    expect(observed.delta.value).toMatchObject({
      second: 'committed',
      third: {
        status: 'failed',
        diagnostics: [expect.objectContaining({ code: 'OUTPUT_MANIFEST_STALE' })],
      },
      telemetry: { mode: 'full', reason: 'manifest-stamp' },
    });
    expect({ ...(observed.delta.value as object), telemetry: undefined }).toEqual(
      observed.full.value,
    );
    expect(observed.delta.tree).toEqual(observed.full.tree);
  });

  it('a commit whose manifest bytes were already on disk records no publication', async () => {
    const arm = new Arm(await temporary('ng-doc-s4-same-manifest'), true);
    await arm.commit(1, snapshot(base, 'm1'));
    await arm.commit(2, snapshot(base, 'm2'));
    expect(arm.committer.inspect()).toMatchObject({ mode: 'delta' });
    // The same generation and candidate again: the manifest is not rewritten, so its stamp is not
    // tied to a file this commit wrote, and the next commit is full.
    expect(await arm.commit(2, snapshot(base, 'm2'))).toMatchObject({
      status: 'committed',
      written: [],
    });
    await arm.commit(3, snapshot(base, 'm3'));
    expect(arm.committer.inspect()).toMatchObject({ mode: 'full', reason: 'untrusted' });
  });

  it('an incomplete rollback (OUTPUT_STAGE_PRESERVED) followed by an edit commits in full, as the kill switch', async () => {
    const observed = await arms('ng-doc-s4-preserved', async (arm) => {
      await arm.commit(1, snapshot(base, 'c1'));
      arm.fault = 'publish-manifest';
      // Rollback renames through the module's `rename`: its restore of a published output fails.
      const originalRename = fsPromises.rename;
      vi.spyOn(fsPromises, 'rename').mockImplementation((async (
        from: Parameters<typeof originalRename>[0],
        to: Parameters<typeof originalRename>[1],
      ) => {
        if (
          typeof from === 'string' &&
          from.includes(`${path.sep}backups${path.sep}changed${path.sep}`)
        )
          throw new Error('injected rollback rename failure');
        return originalRename(from, to);
      }) as typeof originalRename);
      const second = await arm.commit(
        2,
        snapshot(edit(base, 'one', 'guides/one/page.ts', 'one 2'), 'c2'),
      );
      vi.restoreAllMocks();
      arm.fault = undefined;
      const third = await arm.commit(
        3,
        snapshot(edit(base, 'two', 'guides/two/page.ts', 'two 3'), 'c3'),
      );
      return {
        second: second.status,
        codes: second.diagnostics.map((item) => item.code),
        third,
        telemetry: arm.delta ? arm.committer.inspect() : undefined,
      };
    });
    expect(observed.delta.value).toMatchObject({
      second: 'failed',
      codes: expect.arrayContaining([
        'OUTPUT_COMMIT_FAILED',
        'OUTPUT_ROLLBACK_FAILED',
        'OUTPUT_STAGE_PRESERVED',
      ]),
      third: {
        status: 'committed',
        written: expect.arrayContaining(['guides/one/page.ts', 'guides/two/page.ts']),
      },
      telemetry: { mode: 'full', reason: 'untrusted' },
    });
    expect({ ...(observed.delta.value as object), telemetry: undefined }).toEqual(
      observed.full.value,
    );
    expect(observed.delta.tree).toEqual(observed.full.tree);
    expect(observed.delta.tree['guides/one/page.ts']).toBe('one');
  });

  it('post-publish verification does not record an output rewritten in place with its mtime restored', async () => {
    // An in-place, same-size rewrite that restores the nanosecond mtime (`touch -r`, `cp -p`,
    // `rsync -t`) keeps device, inode, size and mtime; only the ctime shows it.
    const observed = await arms('ng-doc-s4-touch-r', async (arm, root) => {
      let offset = 0;
      let injected = false;
      vi.spyOn(Date, 'now').mockImplementation(() => realNow() + offset);
      arm.committer = new TransactionalOutputCommitter({
        outputRoot: root,
        delta: arm.delta,
        beforeMutation: async (operation: CommitMutation) => {
          if (operation !== 'publish-manifest' || injected) return;
          injected = true;
          const target = path.join(root, 'guides/one/page.ts');
          const reference = `${root}.reference`;
          execFileSync('touch', ['-r', target, reference]);
          await writeFile(target, 'EXT');
          execFileSync('touch', ['-r', reference, target]);
          await rm(reference);
          offset += 10_000;
        },
      });
      const first = await arm.commit(1, snapshot(base, 'r1'));
      const recorded = [
        ...(arm.committer as unknown as { verified: Map<string, unknown> }).verified.keys(),
      ];
      const second = await arm.commit(2, snapshot(base, 'r2'), { base: false });
      return { first: first.status, oneRecorded: recorded.includes('guides/one/page.ts'), second };
    });
    expect(observed.delta.value).toMatchObject({
      first: 'committed',
      oneRecorded: false,
      second: { status: 'committed', written: ['guides/one/page.ts'] },
    });
    expect(observed.delta.value).toEqual(observed.full.value);
    expect(observed.delta.tree).toEqual(observed.full.tree);
    expect(observed.delta.tree['guides/one/page.ts']).toBe('one');
  });

  it('on whole-second timestamps nothing is recorded after publication and every commit is full', async () => {
    const root = await temporary('ng-doc-s4-coarse');
    // A coarse-timestamp filesystem: every stat under the root reports whole seconds.
    const originalLstat = fsPromises.lstat;
    const coarse = (value: bigint) => (value / 1_000_000_000n) * 1_000_000_000n;
    vi.spyOn(fsPromises, 'lstat').mockImplementation((async (
      file: Parameters<typeof originalLstat>[0],
      options?: Parameters<typeof originalLstat>[1],
    ) => {
      const stats = await (originalLstat as (...values: unknown[]) => Promise<unknown>)(
        file,
        options,
      );
      if (
        typeof file !== 'string' ||
        !file.startsWith(root) ||
        !options ||
        !(options as { bigint?: boolean }).bigint
      )
        return stats;
      const bigintStats = stats as import('node:fs').BigIntStats;
      return Object.assign(Object.create(bigintStats) as object, {
        mtimeNs: coarse(bigintStats.mtimeNs),
        ctimeNs: coarse(bigintStats.ctimeNs),
      });
    }) as typeof originalLstat);
    let offset = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => realNow() + offset);
    const arm = new Arm(root, true);
    arm.committer = new TransactionalOutputCommitter({
      outputRoot: root,
      beforeMutation: (operation) => {
        if (operation === 'publish-manifest') offset += 10_000;
      },
    });
    await arm.commit(1, snapshot(base, 'w1'));
    expect((arm.committer as unknown as { verified: Map<string, unknown> }).verified.size).toBe(0);
    await arm.commit(2, snapshot(edit(base, 'one', 'guides/one/page.ts', 'one 2'), 'w2'));
    expect(arm.committer.inspect()).toMatchObject({ mode: 'full', reason: 'untrusted' });
    await arm.commit(3, snapshot(base, 'w3'));
    expect(arm.committer.inspect()).toMatchObject({ mode: 'full', reason: 'untrusted' });
  });
});
