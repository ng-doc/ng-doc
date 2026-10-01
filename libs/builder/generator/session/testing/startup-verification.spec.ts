/** @vitest-environment node */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type Mock, afterEach, describe, expect, it, vi } from 'vitest';

import type {
  BuildEvent,
  BuildResult,
  CompilationRequest,
  CompilationResult,
  Dependency,
  Diagnostic,
} from '../../contracts';
import { type SessionOptions, createBuildSession, GeneratorBuildSession } from '../build-session';
import * as verification from '../input-verification';
import { inputsUnchanged, physicalInputs } from '../input-verification';
import { compilation, deferred, Events, harness, until } from './support';

const digest = (value: string) => createHash('sha256').update(value).digest('hex');

/** A native workspace whose compiler reports the real filesystem observations it made. */
function workspace() {
  const root = mkdtempSync(join(tmpdir(), 'ngdoc-startup-'));
  const docs = join(root, 'docs');
  const output = join(root, 'generated');
  const cache = join(root, 'cache');
  mkdirSync(docs, { recursive: true });
  const page = join(docs, 'page.md');
  const missing = join(docs, 'missing.md');
  writeFileSync(page, 'initial body');
  const compile = vi.fn(
    async (request: CompilationRequest, _signal: AbortSignal): Promise<CompilationResult> => {
      const body = existsSync(page) ? readFileSync(page, 'utf8') : '<deleted>';
      const members = ['docs/page.md', 'docs/extra.md', 'generated/index.ts']
        .map((file) => join(root, file))
        .filter((file) => existsSync(file));
      const generatedIndex = join(output, 'index.ts');
      const dependencies: Dependency[] = [
        existsSync(page)
          ? { kind: 'content', path: page, digest: digest(body) }
          : { kind: 'existence', path: page, exists: false },
        { kind: 'existence', path: missing, exists: existsSync(missing) },
        {
          kind: 'glob',
          root,
          include: ['docs/**/*.md', 'generated/**/*.ts'],
          exclude: [],
          members,
        },
        existsSync(generatedIndex)
          ? {
              kind: 'content',
              path: generatedIndex,
              digest: digest(readFileSync(generatedIndex, 'utf8')),
            }
          : { kind: 'existence', path: generatedIndex, exists: false },
      ];
      const result = compilation(`${request.generation}:${body}`);
      result.candidate!.configuration = {
        outputRoot: output,
        cacheRoot: cache,
        assetDirectory: 'assets',
        themes: { light: 'light', dark: 'dark' },
        digest: 'configuration',
      };
      result.dependencies = dependencies;
      return result;
    },
  );
  return { root, docs, output, cache, page, missing, compile };
}

describe('post-subscription startup verification', () => {
  const sessions: GeneratorBuildSession[] = [];
  const roots: string[] = [];
  function setup(options: SessionOptions = {}) {
    const w = workspace();
    roots.push(w.root);
    const h = harness();
    h.compile.mockImplementation(w.compile);
    const s = createBuildSession(h.services, { batchDelayMs: 0, ...options });
    sessions.push(s);
    return { ...w, h, s };
  }
  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.allSettled(sessions.splice(0).map((item) => item.dispose()));
    roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }));
  });

  it('reuses an unchanged development buildOnce as watch readiness with exactly one generation', async () => {
    const { h, s, output, page } = setup();
    const built = await s.buildOnce({ mode: 'development' });
    expect(built).toMatchObject({ status: 'success', generation: 1 });
    // Owned-root membership that the compiler did not observe does not disqualify the baseline.
    mkdirSync(join(output, 'guides'), { recursive: true });
    writeFileSync(join(output, 'guides', 'page.ts'), 'export {};');
    const events: BuildEvent[] = [];
    const source = new Events();
    const watch = await s.watch(source, (event) => events.push(event));
    expect(await watch.initial).toEqual(built);
    expect(h.compile).toHaveBeenCalledTimes(1);
    expect(h.commit).toHaveBeenCalledTimes(1);
    expect(events).toEqual([]);
    expect(s.inspect()).toMatchObject({ generation: 1, watching: true, building: false });

    // The watch is live: a later native change produces the next generation.
    writeFileSync(page, 'edited body');
    source.emit({ kind: 'update', path: page });
    await until(() => h.commit.mock.calls.length === 2);
    await until(() => events.some((event) => event.kind === 'result'));
    expect(h.compile.mock.calls[1][0]).toMatchObject({
      generation: 2,
      mode: 'development',
      changes: [{ kind: 'update', path: page }],
      previous: { revision: '1:initial body' },
    });
    expect(events.map((event) => event.kind)).toEqual(['started', 'result']);
    await watch.dispose();
  });

  it('hands the verified baseline to exactly one watch, isolated from session state', async () => {
    const { h, s, page } = setup();
    const built = await s.buildOnce({ mode: 'development' });
    const clone = vi.spyOn(globalThis, 'structuredClone');
    const first = await s.watch(new Events(), () => {});
    const initial = await first.initial;
    // Reuse copies no snapshot: the recorded baseline is already a private copy.
    expect(clone).not.toHaveBeenCalled();
    clone.mockRestore();
    expect(initial).toEqual(built);
    expect(initial).not.toBe(built);
    if (initial.status !== 'success') throw new Error('Expected success');
    // The consumer owns the result: mutating it cannot reach the session or a later watch.
    initial.snapshot.revision = 'mutated by the first consumer';
    initial.generation = 99;
    expect(s.inspect()).toMatchObject({ generation: 1, lastGoodRevision: '1:initial body' });
    await first.dispose();

    // The baseline was consumed, so a second watch without a newer buildOnce generates.
    const second = await s.watch(new Events(), () => {});
    expect(await second.initial).toMatchObject({
      status: 'success',
      generation: 2,
      snapshot: { revision: '2:initial body' },
    });
    expect(h.compile).toHaveBeenCalledTimes(2);
    expect(h.compile.mock.calls[1][0]).toMatchObject({
      generation: 2,
      changes: [],
      contentRequest: { origin: 'reconcile' },
      previous: { revision: '1:initial body' },
    });
    await second.dispose();

    // A newer development buildOnce records a new baseline that the next watch reuses again.
    writeFileSync(page, 'next body');
    const rebuilt = await s.buildOnce({ mode: 'development' });
    const third = await s.watch(new Events(), () => {});
    expect(await third.initial).toEqual(rebuilt);
    expect(h.compile).toHaveBeenCalledTimes(3);
    await third.dispose();
  });

  it.each([
    ['a content edit', (w: ReturnType<typeof workspace>) => writeFileSync(w.page, 'raced body')],
    ['a deleted input', (w: ReturnType<typeof workspace>) => rmSync(w.page)],
    ['a created missing input', (w: ReturnType<typeof workspace>) => writeFileSync(w.missing, 'x')],
    [
      'a new glob member',
      (w: ReturnType<typeof workspace>) => writeFileSync(join(w.docs, 'extra.md'), 'x'),
    ],
    [
      'an owned output the compiler read',
      (w: ReturnType<typeof workspace>) => {
        mkdirSync(w.output, { recursive: true });
        writeFileSync(join(w.output, 'index.ts'), 'export {};');
      },
    ],
  ])(
    'regenerates after %s between buildOnce and native subscription readiness',
    async (_name, mutate) => {
      const w = setup();
      const { h, s } = w;
      await s.buildOnce({ mode: 'development' });
      const source = new Events();
      const gate = deferred<void>();
      source.gate = gate.promise;
      const events: BuildEvent[] = [];
      const watch = await s.watch(source, (event) => events.push(event));
      await until(() => source.subscribed === 1);
      // The native watcher is not ready yet, so it can never report this change.
      mutate(w);
      gate.resolve();
      const initial = await watch.initial;
      expect(initial).toMatchObject({ status: 'success', generation: 2 });
      expect(h.compile).toHaveBeenCalledTimes(2);
      expect(h.compile.mock.calls[1][0]).toMatchObject({
        generation: 2,
        mode: 'development',
        changes: [],
        contentRequest: { origin: 'reconcile' },
        previous: { revision: '1:initial body' },
      });
      if (initial.status !== 'success') throw new Error('Expected success');
      const body = existsSync(w.page) ? readFileSync(w.page, 'utf8') : '<deleted>';
      expect(initial.snapshot.revision).toBe(`2:${body}`);
      expect(events.map((event) => event.kind)).toEqual(['started', 'result']);
      await watch.dispose();
    },
  );

  it('generates when a watcher event arrives during subscription or verification', async () => {
    // The event itself must disqualify the baseline, so it is not screened as an unchanged save
    // (unchanged-saves.spec.ts covers that an unchanged save keeps the verified baseline).
    const { h, s, page } = setup({ skipUnchangedSaves: false });
    await s.buildOnce({ mode: 'development' });
    const source = new Events();
    const gate = deferred<void>();
    source.gate = gate.promise;
    const watch = await s.watch(source, () => {});
    await until(() => source.subscribed === 1);
    source.emit({ kind: 'update', path: page });
    gate.resolve();
    expect(await watch.initial).toMatchObject({ status: 'success', generation: 2 });
    expect(h.compile.mock.calls[1][0].changes).toEqual([{ kind: 'update', path: page }]);
    await watch.dispose();

    const verifying = deferred<boolean>();
    vi.spyOn(verification, 'inputsUnchanged').mockImplementationOnce(() => verifying.promise);
    await s.buildOnce({ mode: 'development' });
    const second = new Events();
    const restarted = await s.watch(second, () => {});
    await until(() => (verification.inputsUnchanged as Mock).mock.calls.length === 1);
    second.emit({ kind: 'update', path: page });
    verifying.resolve(true);
    expect(await restarted.initial).toMatchObject({ status: 'success', generation: 4 });
    expect(h.compile.mock.calls[3][0].changes).toEqual([{ kind: 'update', path: page }]);
    await restarted.dispose();
  });

  it('generates when a microtask event races the verified continuation', async () => {
    const { h, s, page } = setup({ skipUnchangedSaves: false });
    await s.buildOnce({ mode: 'development' });
    const source = new Events();
    vi.spyOn(verification, 'inputsUnchanged').mockImplementationOnce(async () => {
      // Resolves verification, then emits before the watch continuation runs.
      void Promise.resolve().then(() => source.emit({ kind: 'update', path: page }));
      return true;
    });
    const watch = await s.watch(source, () => {});
    expect(await watch.initial).toMatchObject({ status: 'success', generation: 2 });
    expect(h.compile).toHaveBeenCalledTimes(2);
    await watch.dispose();
  });

  it('keeps the ordinary generation for production, unverifiable, failed and superseded baselines', async () => {
    const production = setup();
    await production.s.buildOnce();
    const first = await production.s.watch(new Events(), () => {});
    expect(await first.initial).toMatchObject({ generation: 2 });

    const empty = setup();
    empty.h.compile.mockImplementation(async (request) =>
      compilation(`empty-${request.generation}`),
    );
    await empty.s.buildOnce({ mode: 'development' });
    const second = await empty.s.watch(new Events(), () => {});
    expect(await second.initial).toMatchObject({ generation: 2 });

    const failing = setup();
    vi.spyOn(verification, 'inputsUnchanged').mockRejectedValueOnce(new Error('unreadable'));
    await failing.s.buildOnce({ mode: 'development' });
    const third = await failing.s.watch(new Events(), () => {});
    expect(await third.initial).toMatchObject({ status: 'success', generation: 2 });

    const superseded = setup();
    await superseded.s.buildOnce({ mode: 'development' });
    const verifying = deferred<boolean>();
    vi.spyOn(verification, 'inputsUnchanged').mockImplementationOnce(() => verifying.promise);
    const fourth = await superseded.s.watch(new Events(), () => {});
    await until(() => (verification.inputsUnchanged as Mock).mock.calls.length === 2);
    // An unrelated buildOnce runs while the watch is verifying and supersedes the baseline.
    await superseded.s.buildOnce({ mode: 'development' });
    verifying.resolve(true);
    expect(await fourth.initial).toMatchObject({ status: 'success', generation: 3 });
    expect(superseded.h.compile).toHaveBeenCalledTimes(3);

    const cancelled = setup();
    cancelled.h.commit.mockResolvedValueOnce({ status: 'stale', diagnostics: [] });
    expect(await cancelled.s.buildOnce({ mode: 'development' })).toMatchObject({
      status: 'cancelled',
    });
    const fifth = await cancelled.s.watch(new Events(), () => {});
    expect(await fifth.initial).toMatchObject({ status: 'success', generation: 2 });
  });

  it('reports a content failure as a plain failure and still reuses a later baseline', async () => {
    const { h, s } = setup();
    await s.buildOnce({ mode: 'development' });
    // The session keeps no content ledger: a failed content render holds nothing back.
    h.compile.mockImplementationOnce(async () => ({
      dependencies: [],
      diagnostics: [{ severity: 'error', stage: 'content', code: 'CONTENT_RENDER', message: 'A' }],
      whyRebuilt: [],
    }));
    const failed = await s.buildOnce({ mode: 'development' });
    expect(failed).toMatchObject({ status: 'failure', lastGoodRevision: '1:initial body' });
    await s.buildOnce({ mode: 'development' });
    const watch = await s.watch(new Events(), () => {});
    expect(await watch.initial).toMatchObject({ status: 'success', generation: 3 });
    expect(h.compile).toHaveBeenCalledTimes(3);
  });

  it('runs a rescan asked before readiness instead of reusing the baseline', async () => {
    const { h, s } = setup();
    await s.buildOnce({ mode: 'development' });
    const source = new Events();
    const gate = deferred<void>();
    source.gate = gate.promise;
    const watch = await s.watch(source, () => {});
    await s.rescan();
    await until(() => source.subscribed === 1);
    expect(h.compile).toHaveBeenCalledTimes(1);
    gate.resolve();
    // The committed inputs are re-observed first; none changed, so it is a reconcile generation.
    expect(await watch.initial).toMatchObject({ status: 'success', generation: 2 });
    expect(h.compile.mock.calls[1][0]).toMatchObject({
      changes: [],
      contentRequest: { origin: 'reconcile' },
      previous: { revision: '1:initial body' },
    });
    await watch.dispose();
  });

  it.each(['stop', 'dispose'] as const)(
    'cancels readiness when the watch is stopped by %s during verification',
    async (action) => {
      const { h, s } = setup();
      await s.buildOnce({ mode: 'development' });
      const verifying = deferred<boolean>();
      vi.spyOn(verification, 'inputsUnchanged').mockImplementationOnce(() => verifying.promise);
      const watch = await s.watch(new Events(), () => {});
      await until(() => (verification.inputsUnchanged as Mock).mock.calls.length === 1);
      const stopped = action === 'stop' ? watch.dispose() : s.dispose();
      verifying.resolve(true);
      expect(await watch.initial).toMatchObject({ status: 'cancelled' });
      await stopped;
      expect(h.compile).toHaveBeenCalledTimes(1);
    },
  );
});

describe('result ownership', () => {
  const sessions: GeneratorBuildSession[] = [];
  function session(h: ReturnType<typeof harness> = harness()) {
    const result = createBuildSession(h.services, { batchDelayMs: 0 });
    sessions.push(result);
    return result;
  }
  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.allSettled(sessions.splice(0).map((item) => item.dispose()));
  });

  it('never aliases the snapshot through a diagnostic an in-process compiler shares', async () => {
    const h = harness();
    const s = session(h);
    // Like the content compiler: one diagnostic object reported at top level and on its artifact.
    const shared: Diagnostic = {
      code: 'S',
      severity: 'warning',
      stage: 'content',
      message: 'shared',
    };
    const raw: CompilationResult = compilation('shared-diagnostic');
    raw.diagnostics = [shared];
    raw.candidate!.artifacts = [{ id: 'a', diagnostics: [shared] } as never];
    h.compile.mockResolvedValue(raw);
    const built = await s.buildOnce({ mode: 'development' });
    if (built.status !== 'success') throw new Error('Expected success');
    expect(built.diagnostics).toEqual([shared, shared]);
    const published = built.snapshot.artifacts[0].diagnostics[0];
    for (const reported of built.diagnostics) {
      expect(reported).not.toBe(published);
      expect(reported).not.toBe(shared);
    }
    built.diagnostics[0].message = 'consumer mutation';
    built.diagnostics[1].message = 'consumer mutation';
    expect(published.message).toBe('shared');
    const committed = h.commit.mock.calls[0][0].candidate.artifacts[0].diagnostics[0];
    expect(committed.message).toBe('shared');
    shared.message = 'compiler mutation';
    expect(published.message).toBe('shared');
  });

  it('copies full snapshots once per owner and never aliases the compiler, waiters or diagnostics', async () => {
    const h = harness();
    const s = session(h);
    const warning: Diagnostic = {
      code: 'W',
      severity: 'warning',
      stage: 'content',
      message: 'warn',
    };
    // An in-process compiler that keeps (and later mutates) the result it returned.
    const raw: CompilationResult = compilation('shared');
    raw.candidate!.artifacts = [{ id: 'a', diagnostics: [warning] } as never];
    raw.dependencies = [{ kind: 'content', path: '/docs/page.md', digest: 'one' }];
    h.compile.mockResolvedValue(raw);
    const full = (value: unknown) =>
      !!value &&
      typeof value === 'object' &&
      ('artifacts' in value || 'snapshot' in value || 'candidate' in value);
    const clone = vi.spyOn(globalThis, 'structuredClone');
    const built = await s.buildOnce({ mode: 'development' });
    // compiler result, retained snapshot, watch-start baseline and the published result.
    expect(clone.mock.calls.filter(([value]) => full(value))).toHaveLength(4);
    clone.mockRestore();
    if (built.status !== 'success') throw new Error('Expected success');
    const committedCandidate = h.commit.mock.calls[0][0].candidate;
    expect(committedCandidate).not.toBe(raw.candidate);
    expect(built.snapshot).not.toBe(raw.candidate);
    expect(built.snapshot).not.toBe(committedCandidate);
    expect(built.diagnostics).toEqual([warning]);
    expect(built.diagnostics[0]).not.toBe(built.snapshot.artifacts[0].diagnostics[0]);
    built.diagnostics[0].message = 'consumer mutation';
    expect(built.snapshot.artifacts[0].diagnostics[0].message).toBe('warn');
    expect(committedCandidate.artifacts[0].diagnostics[0].message).toBe('warn');
    raw.candidate!.revision = 'compiler mutation';
    expect(built.snapshot.revision).toBe('shared');
    expect(committedCandidate.revision).toBe('shared');

    // The watch's initial waiter and its observer receive independent results of one generation.
    h.compile.mockResolvedValue(compilation('coalesced'));
    const observed: BuildResult[] = [];
    const watch = await s.watch(new Events(), (event) => {
      if (event.kind === 'result') observed.push(event.result);
    });
    const first = await watch.initial;
    await until(() => observed.length === 1);
    const second = observed[0];
    expect(h.compile).toHaveBeenCalledTimes(2);
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    if (first.status !== 'success' || second.status !== 'success')
      throw new Error('Expected success');
    first.snapshot.revision = 'first consumer';
    expect(second.snapshot.revision).toBe('coalesced');
    expect(s.inspect().lastGoodRevision).toBe('coalesced');
    await watch.dispose();
  });
});

describe('input verification', () => {
  const roots: string[] = [];
  afterEach(() =>
    roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })),
  );

  it('selects only filesystem observations', () => {
    const inputs: Dependency[] = [
      { kind: 'content', path: '/a', digest: 'a' },
      { kind: 'existence', path: '/b', exists: false },
      { kind: 'glob', root: '/', include: ['*'], exclude: [], members: [] },
      { kind: 'keyword', key: 'K', digest: 'k' },
      { kind: 'semantic-reference', scopeId: 's', digest: 's', reason: 'r' },
    ];
    expect(physicalInputs(inputs).map((item) => item.kind)).toEqual([
      'content',
      'existence',
      'glob',
    ]);
  });

  it('compares every chunk and reports scan failures and changed membership', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ngdoc-inputs-'));
    roots.push(root);
    const files = Array.from({ length: 150 }, (_, index) => {
      const file = join(root, `file-${index}.md`);
      writeFileSync(file, `body ${index}`);
      return { kind: 'content' as const, path: file, digest: digest(`body ${index}`) };
    });
    const owned = join(root, 'owned');
    mkdirSync(owned);
    writeFileSync(join(owned, 'out.md'), 'x');
    const members = files.map((file) => file.path);
    const glob = { kind: 'glob' as const, root, include: ['**/*.md'], exclude: [], members };
    expect(await inputsUnchanged([...files, glob], [owned])).toBe(true);
    expect(await inputsUnchanged([glob], [])).toBe(false);
    writeFileSync(files[140].path, 'changed');
    expect(await inputsUnchanged(files, [owned])).toBe(false);
    expect(
      await inputsUnchanged([{ kind: 'existence', path: join(root, 'absent'), exists: true }], []),
    ).toBe(false);
    expect(
      await inputsUnchanged(
        // A file root fails the scan (ENOTDIR) while returning the recorded, equal membership.
        [{ kind: 'glob', root: files[0].path, include: ['**/*'], exclude: [], members: [] }],
        [],
      ),
    ).toBe(false);
  });
});
