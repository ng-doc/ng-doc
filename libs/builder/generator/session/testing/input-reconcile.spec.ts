/** @vitest-environment node */

import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { BuildEvent, Dependency } from '../../contracts';
import { type GeneratorBuildSession, createBuildSession } from '../build-session';
import * as verification from '../input-verification';
import { type PhysicalInput, reobservedChanges } from '../input-verification';
import { compilation, deferred, Events, harness, until } from './support';

/**
 * A watch host re-observes only the inputs it has just begun watching: a generation may have read
 * them before any watch could report a change. Differences become ordinary watcher changes; when
 * nothing differs no generation runs. A host that cannot name the paths it may have missed asks
 * for a rescan of every committed input instead.
 */

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const roots: string[] = [];

function temporary(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'ngdoc-reobserve-')));
  roots.push(root);
  return root;
}

afterEach(() => {
  vi.restoreAllMocks();
  roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }));
});

describe('reobservedChanges', () => {
  it('compares only the recorded observations at the given paths', async () => {
    const root = temporary();
    const docs = join(root, 'docs');
    const owned = join(root, 'generated');
    mkdirSync(docs, { recursive: true });
    mkdirSync(owned, { recursive: true });
    const same = join(docs, 'same.md');
    const edited = join(docs, 'edited.md');
    const removed = join(docs, 'removed.md');
    const appeared = join(docs, 'appeared.md');
    const elsewhere = join(root, 'elsewhere.md');
    const output = join(owned, 'index.ts');
    for (const file of [same, edited, removed, elsewhere, output]) writeFileSync(file, 'before');
    const inputs: PhysicalInput[] = [
      { kind: 'content', path: same, digest: digest('before') },
      { kind: 'content', path: edited, digest: digest('before') },
      { kind: 'content', path: removed, digest: digest('before') },
      { kind: 'existence', path: appeared, exists: false },
      { kind: 'content', path: elsewhere, digest: digest('before') },
      { kind: 'content', path: output, digest: digest('before') },
    ];
    writeFileSync(edited, 'after');
    unlinkSync(removed);
    writeFileSync(appeared, 'new');
    writeFileSync(elsewhere, 'after');
    writeFileSync(output, 'after');

    // Unchanged or unrequested paths report nothing; owned output is never reported.
    expect(await reobservedChanges(inputs, [owned], [same, output])).toEqual([]);
    expect(await reobservedChanges(inputs, [owned], [edited, removed, appeared])).toEqual([
      { kind: 'create', path: appeared },
      { kind: 'update', path: edited },
      { kind: 'delete', path: removed },
    ]);
    // A directory selects every observation below it.
    expect(await reobservedChanges(inputs, [owned], [docs])).toEqual([
      { kind: 'create', path: appeared },
      { kind: 'update', path: edited },
      { kind: 'delete', path: removed },
    ]);
    expect(await reobservedChanges(inputs, [owned], [])).toEqual([]);
  });

  it('re-scans globs at, below or above a path and reports unrecorded paths as changed', async () => {
    const root = temporary();
    const docs = join(root, 'docs');
    mkdirSync(join(docs, 'guide'), { recursive: true });
    const member = join(docs, 'guide/page.md');
    const created = join(docs, 'guide/created.md');
    writeFileSync(member, 'member');
    const glob: PhysicalInput = {
      kind: 'glob',
      root,
      include: ['docs/**/*.md'],
      exclude: [],
      members: [member],
    };
    // A glob records membership, never content: a member is compared through its own content
    // observation, and without one it is reported.
    expect(await reobservedChanges([glob], [], [member])).toEqual([
      { kind: 'update', path: member },
    ]);
    const read: PhysicalInput = { kind: 'content', path: member, digest: digest('member') };
    expect(await reobservedChanges([glob, read], [], [member])).toEqual([]);
    // So is any file below a glob root that nothing recorded, such as an include beside an API
    // scope rooted at the workspace root.
    const include = join(root, 'shared/include.md');
    mkdirSync(join(root, 'shared'));
    writeFileSync(include, 'never recorded');
    expect(await reobservedChanges([glob], [], [include])).toEqual([
      { kind: 'update', path: include },
    ]);
    writeFileSync(created, 'created');
    // A glob base below the root, and a directory above it, both re-scan it.
    expect(await reobservedChanges([glob], [], [docs])).toEqual([
      { kind: 'create', path: created },
    ]);
    expect(await reobservedChanges([glob], [], [join(root, '..')])).toEqual([
      { kind: 'create', path: created },
    ]);
    // No recorded observation at all: reported, as an update or a delete.
    const unknown = join(root, 'unknown.md');
    const missing = join(root, 'missing.md');
    writeFileSync(unknown, 'x');
    expect(await reobservedChanges([], [], [missing, unknown])).toEqual([
      { kind: 'delete', path: missing },
      { kind: 'update', path: unknown },
    ]);
  });
});

describe('BuildSession.reconcileInputs and rescan', () => {
  const sessions: GeneratorBuildSession[] = [];
  afterEach(async () => {
    await Promise.all(sessions.splice(0).map((session) => session.dispose()));
  });

  async function watching() {
    const root = temporary();
    const page = join(root, 'page.md');
    const snippet = join(root, 'snippet.md');
    writeFileSync(page, 'page v1');
    writeFileSync(snippet, 'snippet v1');
    const observe = (file: string): Dependency => ({
      kind: 'content',
      path: file,
      digest: digest(readFileSync(file, 'utf8')),
    });
    const h = harness();
    h.compile.mockImplementation(async (request) => ({
      ...compilation(`test-${request.generation}`),
      dependencies: [observe(page), observe(snippet)],
    }));
    const session = createBuildSession(h.services, { batchDelayMs: 0 });
    sessions.push(session);
    const source = new Events();
    const events: BuildEvent[] = [];
    const watch = await session.watch(source, (event) => events.push(event));
    expect(await watch.initial).toMatchObject({ status: 'success' });
    return { root, page, snippet, h, session, source, events, watch };
  }

  it('runs no generation when the new inputs are unchanged', async () => {
    const w = await watching();
    await w.session.reconcileInputs([w.snippet]);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(w.h.compile).toHaveBeenCalledTimes(1);
    // Only the initial generation ever started.
    expect(w.events.filter((event) => event.kind === 'started')).toHaveLength(1);
  });

  it('admits a difference as an ordinary filesystem change', async () => {
    const w = await watching();
    writeFileSync(w.snippet, 'snippet v2');
    await w.session.reconcileInputs([w.snippet]);
    await until(() => w.h.commit.mock.calls.length === 2);
    expect(w.h.compile.mock.calls[1][0]).toMatchObject({
      generation: 2,
      changes: [{ kind: 'update', path: w.snippet }],
      contentRequest: { origin: 'filesystem' },
    });
  });

  it('reports every path as changed when re-observation fails', async () => {
    const w = await watching();
    vi.spyOn(verification, 'reobservedChanges').mockRejectedValueOnce(new Error('unreadable'));
    // The file is unchanged, so only the fallback can report it. The unchanged-save screen then
    // recognises the committed bytes and drops the change without a generation.
    await w.session.reconcileInputs([w.snippet]);
    expect(w.events).toContainEqual({
      kind: 'unchanged',
      changes: [{ kind: 'update', path: w.snippet }],
    });
    expect(w.h.compile).toHaveBeenCalledTimes(1);
  });

  it('compares the new inputs of a failed generation with what it read, not with the last commit', async () => {
    const root = temporary();
    const snippet = join(root, 'snippet.md');
    writeFileSync(snippet, 'snippet v1');
    const h = harness();
    h.compile.mockImplementation(async (request) => {
      const text = readFileSync(snippet, 'utf8');
      return {
        ...compilation(`test-${request.generation}`),
        dependencies: [{ kind: 'content', path: snippet, digest: digest(text) }],
        diagnostics: text.includes('broken')
          ? [{ code: 'BROKEN', severity: 'error', stage: 'content', message: 'Broken include' }]
          : [],
      };
    });
    const session = createBuildSession(h.services, { batchDelayMs: 0 });
    sessions.push(session);
    const source = new Events();
    const results: string[] = [];
    const watch = await session.watch(source, (event) => {
      if (event.kind === 'result') results.push(event.result.status);
    });
    expect(await watch.initial).toMatchObject({ status: 'success' });
    writeFileSync(snippet, 'broken');
    source.emit({ kind: 'update', path: snippet });
    await until(() => results.includes('failure'));
    // Still what the failed generation read: nothing to regenerate (the commit read "snippet v1").
    await session.reconcileInputs([snippet]);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(h.compile).toHaveBeenCalledTimes(2);
    // Fixed after that generation read it: the fix is an ordinary change.
    writeFileSync(snippet, 'fixed');
    await session.reconcileInputs([snippet]);
    await until(() => h.commit.mock.calls.length === 2);
    expect(h.compile.mock.calls[2][0].changes).toEqual([{ kind: 'update', path: snippet }]);
    // After a commit, the failed generation's observations are no longer used.
    await session.reconcileInputs([snippet]);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(h.compile).toHaveBeenCalledTimes(3);
  });

  it('does nothing without paths, a watch, or once the watch or session stopped', async () => {
    const w = await watching();
    await w.session.reconcileInputs([]);
    // A result that lands after the watch stopped admits nothing.
    writeFileSync(w.snippet, 'snippet v2');
    const reobserving = w.session.reconcileInputs([w.snippet]);
    await w.watch.dispose();
    await reobserving;
    await w.session.reconcileInputs([w.snippet]);
    expect(w.h.compile).toHaveBeenCalledTimes(1);

    const idle = createBuildSession(harness().services, { batchDelayMs: 0 });
    await idle.reconcileInputs([w.snippet]);
    await idle.dispose();
    await idle.reconcileInputs([w.snippet]);
  });

  it('rescan: finds a lost edit of any committed input, resolving before its generation runs', async () => {
    const w = await watching();
    writeFileSync(w.page, 'page v2');
    await w.session.rescan();
    // Scheduled only: the re-observation and the generation come later.
    expect(w.h.compile).toHaveBeenCalledTimes(1);
    await until(() => w.h.commit.mock.calls.length === 2 && !w.session.inspect().building);
    // An ordinary filesystem change, so the compiler's own checks decide about its retained
    // program; the commit is the full one, which re-verifies every output.
    expect(w.h.compile.mock.calls[1][0]).toMatchObject({
      generation: 2,
      changes: [{ kind: 'update', path: w.page }],
      contentRequest: { origin: 'filesystem' },
    });
    expect(w.h.commit.mock.calls[1][0].base).toBeUndefined();
    // The next watched edit may be a delta commit again.
    writeFileSync(w.snippet, 'snippet v2');
    w.source.emit({ kind: 'update', path: w.snippet });
    await until(() => w.h.commit.mock.calls.length === 3 && !w.session.inspect().building);
    expect(w.h.commit.mock.calls[2][0].base).toBeDefined();
  });

  it('rescan: still runs a reconcile generation, with the full commit, when nothing changed', async () => {
    const w = await watching();
    await w.session.rescan();
    await until(() => w.h.commit.mock.calls.length === 2 && !w.session.inspect().building);
    expect(w.h.compile.mock.calls[1][0]).toMatchObject({
      generation: 2,
      changes: [],
      contentRequest: { origin: 'reconcile' },
    });
    expect(w.h.commit.mock.calls[1][0].base).toBeUndefined();
  });

  it('rescan: supersedes the active watch generation and carries its changes', async () => {
    const w = await watching();
    const gate = deferred<void>();
    const compile = w.h.compile.getMockImplementation()!;
    w.h.compile.mockImplementationOnce(async (request, signal) => {
      await gate.promise;
      return compile(request, signal);
    });
    writeFileSync(w.snippet, 'snippet v2');
    w.source.emit({ kind: 'update', path: w.snippet });
    await until(() => w.h.compile.mock.calls.length === 2);
    await w.session.rescan();
    gate.resolve();
    await until(() => w.h.commit.mock.calls.length === 2 && !w.session.inspect().building);
    expect(w.h.compile).toHaveBeenCalledTimes(3);
    expect(w.h.compile.mock.calls[2][0]).toMatchObject({
      generation: 3,
      changes: [{ kind: 'update', path: w.snippet }],
      contentRequest: { origin: 'filesystem' },
    });
    // The rescan's generation takes the full commit, as any rescan does.
    expect(w.h.commit.mock.calls[1][0].base).toBeUndefined();
    const results = w.events.flatMap((event) => (event.kind === 'result' ? [event.result] : []));
    expect(results.map((result) => [result.generation, result.status])).toEqual([
      [1, 'success'],
      [2, 'cancelled'],
      [3, 'success'],
    ]);
  });
});
