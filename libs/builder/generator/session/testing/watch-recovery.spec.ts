/** @vitest-environment node */

import type * as parcel from '@parcel/watcher';
import { createHash } from 'node:crypto';
import {
  existsSync,
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

import type {
  BuildEvent,
  BuildResult,
  CompilationRequest,
  CompilationResult,
  Dependency,
} from '../../contracts';
import {
  type SessionOptions,
  createBuildSession,
  GeneratorBuildSession,
  SessionLifecycleError,
} from '../build-session';
import * as verification from '../input-verification';
import { createParcelEventSource } from '../parcel-event-source';
import { compilation, deferred, Events, harness, until } from './support';

/** The session protocol code for a lossy native watcher (session/watch-signals.ts). */
const WATCHER_RESCAN = 'WATCHER_RESCAN';
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const aborted = (): CompilationResult => ({
  dependencies: [],
  diagnostics: [
    {
      code: 'WORKER_ABORTED',
      severity: 'error',
      stage: 'evaluation',
      message: 'Compilation aborted',
    },
  ],
  whyRebuilt: [],
});
const rescanSignal = {
  code: WATCHER_RESCAN,
  severity: 'warning' as const,
  stage: 'host' as const,
  message: 'Events were dropped by the FSEvents client. File system must be re-scanned.',
};

interface Attempt {
  request: CompilationRequest;
  signal: AbortSignal;
  release(result?: CompilationResult): void;
}

/** A compiler whose generations run until released or aborted, like the worker compiler. */
function blockingCompiler(h: ReturnType<typeof harness>) {
  const attempts: Attempt[] = [];
  h.compile.mockImplementation((request, signal) => {
    const done = deferred<CompilationResult>();
    signal.addEventListener('abort', () => done.resolve(aborted()), { once: true });
    attempts.push({
      request,
      signal,
      release: (result) => done.resolve(result ?? compilation(`test-${request.generation}`)),
    });
    return done.promise;
  });
  return attempts;
}

describe('watch liveness and lossy-watcher recovery', () => {
  const sessions: GeneratorBuildSession[] = [];
  const roots: string[] = [];
  function session(h: ReturnType<typeof harness> = harness(), options: SessionOptions = {}) {
    const result = createBuildSession(h.services, { batchDelayMs: 0, ...options });
    sessions.push(result);
    return result;
  }
  function temporary() {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'ngdoc-recovery-')));
    roots.push(root);
    return root;
  }
  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.allSettled(sessions.splice(0).map((item) => item.dispose()));
    roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }));
  });

  it('publishes the latest edit while a native change arrives during every generation', async () => {
    // In a real run, 49 consecutive generations were superseded by unrelated workspace writes and
    // the edited shared include was never committed until the stream stopped.
    const h = harness();
    const s = session(h);
    const source = new Events();
    const results: BuildResult[] = [];
    const watch = await s.watch(source, (event) => {
      if (event.kind === 'result') results.push(event.result);
    });
    await watch.initial;
    const attempts = blockingCompiler(h);
    source.emit({ kind: 'update', path: '/docs/shared/include.md' });
    for (let noise = 0; noise < 12; noise++) {
      await until(() => attempts.length > noise || s.inspect().queuedBuilds > 0);
      if (attempts.length <= noise) break;
      source.emit({ kind: 'update', path: `/workspace/.angular/cache/${noise}.db` });
      await new Promise((done) => setTimeout(done, 5));
    }
    // Three superseded attempts, then the fourth is protected and keeps running.
    expect(attempts.map((attempt) => attempt.signal.aborted)).toEqual([true, true, true, false]);
    expect(attempts[3].request.changes).toEqual(
      expect.arrayContaining([
        { kind: 'update', path: '/docs/shared/include.md' },
        { kind: 'update', path: '/workspace/.angular/cache/2.db' },
      ]),
    );
    expect(s.inspect()).toMatchObject({ building: true, pendingChanges: 0, queuedBuilds: 1 });
    attempts[3].release();
    await until(() => h.commit.mock.calls.length === 2);
    expect(h.commit.mock.calls[1][0].generation).toBe(attempts[3].request.generation);
    // The changes that arrived meanwhile run next and are superseded again only up to the bound.
    await until(() => attempts.length === 5);
    expect(attempts[4].request.changes).toEqual([
      { kind: 'update', path: '/workspace/.angular/cache/3.db' },
    ]);
    attempts[4].release();
    await until(() => h.commit.mock.calls.length === 3);
    expect(results.map((result) => result.status)).toEqual([
      'success',
      'cancelled',
      'cancelled',
      'cancelled',
      'success',
      'success',
    ]);
    // A settled generation resets the bound: the next change supersedes again.
    source.emit({ kind: 'update', path: '/docs/a.md' });
    await until(() => attempts.length === 6);
    source.emit({ kind: 'update', path: '/docs/b.md' });
    await until(() => attempts[5].signal.aborted);
    await until(() => attempts.length === 7);
    attempts[6].release();
    await until(() => h.commit.mock.calls.length === 4);
  });

  it('keeps watch readiness on a protected startup generation and honours a zero bound', async () => {
    const h = harness();
    const s = session(h, { maxSupersessions: 0 });
    const attempts = blockingCompiler(h);
    const source = new Events();
    const watch = await s.watch(source, () => {});
    await until(() => attempts.length === 1);
    source.emit({ kind: 'update', path: '/raced.md' });
    await until(() => s.inspect().queuedBuilds === 1);
    expect(attempts[0].signal.aborted).toBe(false);
    attempts[0].release();
    expect(await watch.initial).toMatchObject({ status: 'success', generation: 1 });
    await until(() => attempts.length === 2);
    expect(attempts[1].request.changes).toEqual([{ kind: 'update', path: '/raced.md' }]);
    attempts[1].release();
    await until(() => h.commit.mock.calls.length === 2);
  });

  it.each([-1, 1.5, Number.NaN])('rejects an invalid supersession bound %p', (value) => {
    expect(() => createBuildSession(harness().services, { maxSupersessions: value })).toThrow(
      SessionLifecycleError,
    );
  });

  it('reconciles re-observed input differences after a lossy watcher signal and keeps watching', async () => {
    const root = temporary();
    const docs = join(root, 'docs');
    const owned = join(root, 'generated');
    mkdirSync(docs, { recursive: true });
    mkdirSync(owned, { recursive: true });
    const edited = join(docs, 'edited.md');
    const removed = join(docs, 'removed.md');
    const created = join(docs, 'created.md');
    const unchanged = join(docs, 'unchanged.md');
    const output = join(owned, 'index.ts');
    writeFileSync(edited, 'before');
    writeFileSync(removed, 'removed');
    writeFileSync(unchanged, 'unchanged');
    writeFileSync(output, 'generated');
    // The compiler reports what it actually observed, as the real compiler does.
    const observe = (file: string): Dependency =>
      existsSync(file)
        ? { kind: 'content', path: file, digest: digest(readFileSync(file, 'utf8')) }
        : { kind: 'existence', path: file, exists: false };
    const dependencies = (): Dependency[] => [
      observe(edited),
      observe(removed),
      observe(unchanged),
      observe(output),
      { kind: 'existence', path: created, exists: existsSync(created) },
      {
        kind: 'glob',
        root,
        include: ['docs/**/*.md'],
        exclude: [],
        members: [edited, removed, unchanged, created].filter((file) => existsSync(file)),
      },
      { kind: 'semantic', scopeId: 'scope', digest: 'semantic', reason: 'api', files: [edited] },
      { kind: 'semantic-reference', scopeId: 'scope', digest: 'semantic', reason: 'api' },
    ];
    const h = harness();
    h.compile.mockImplementation(async (request) => {
      const result = compilation(`test-${request.generation}`);
      result.candidate!.configuration = {
        outputRoot: owned,
        cacheRoot: join(root, 'cache'),
        assetDirectory: 'assets',
        themes: { light: 'light', dark: 'dark' },
        digest: 'configuration',
      };
      result.dependencies = dependencies();
      return result;
    });
    const s = session(h);
    const source = new Events();
    const events: BuildEvent[] = [];
    const watch = await s.watch(source, (event) => events.push(event));
    expect(await watch.initial).toMatchObject({ status: 'success' });
    // Lost events: every change below happens without a watcher event.
    writeFileSync(edited, 'after');
    unlinkSync(removed);
    writeFileSync(created, 'created');
    writeFileSync(output, 'rewritten by the committer');
    source.onError!(rescanSignal);
    await until(() => h.commit.mock.calls.length === 2);
    expect(h.compile.mock.calls[1][0]).toMatchObject({
      generation: 2,
      contentRequest: { origin: 'filesystem' },
      changes: [
        { kind: 'create', path: created },
        { kind: 'update', path: edited },
        { kind: 'delete', path: removed },
      ],
    });
    expect(events).toContainEqual({ kind: 'diagnostic', diagnostic: rescanSignal });
    expect(s.inspect()).toMatchObject({ watching: true, building: false });
    // Watching continues normally afterwards (a real edit: an identical save is discarded as
    // unchanged, see unchanged-saves.spec.ts).
    writeFileSync(edited, 'edited again');
    source.emit({ kind: 'update', path: edited });
    await until(() => h.commit.mock.calls.length === 3);
    expect(h.compile.mock.calls[2][0].changes).toEqual([{ kind: 'update', path: edited }]);
    // A later rescan with nothing changed still reconciles, with no synthesized changes.
    source.onError!(rescanSignal);
    await until(() => h.commit.mock.calls.length === 4);
    expect(h.compile.mock.calls[3][0]).toMatchObject({
      changes: [],
      contentRequest: { origin: 'reconcile' },
    });
  });

  it('carries a pending rescan through supersession and into a queued batch', async () => {
    const root = temporary();
    const page = join(root, 'page.md');
    writeFileSync(page, 'one');
    const h = harness();
    const s = session(h);
    const source = new Events();
    const watch = await s.watch(source, () => {});
    await watch.initial;
    h.compile.mockImplementation(async (request) => ({
      ...compilation(`test-${request.generation}`),
      dependencies: [{ kind: 'content', path: page, digest: digest('one') }],
    }));
    source.emit({ kind: 'update', path: page });
    await until(() => h.commit.mock.calls.length === 2);
    const attempts = blockingCompiler(h);
    writeFileSync(page, 'two');
    // Rescan starts a reconciling generation; a native change supersedes it and the next
    // generation still reconciles.
    source.onError!(rescanSignal);
    await until(() => attempts.length === 1);
    expect(attempts[0].request.changes).toEqual([{ kind: 'update', path: page }]);
    source.emit({ kind: 'create', path: join(root, 'other.md') });
    await until(() => attempts.length === 2);
    expect(attempts[0].signal.aborted).toBe(true);
    expect(attempts[1].request.changes).toEqual([
      { kind: 'update', path: page },
      { kind: 'create', path: join(root, 'other.md') },
    ]);
    // A rescan arriving while another batch is queued behind a protected generation merges.
    const protectedHarness = harness();
    const guarded = session(protectedHarness, { maxSupersessions: 0 });
    const guardedAttempts = blockingCompiler(protectedHarness);
    const guardedSource = new Events();
    await guarded.watch(guardedSource, () => {});
    await until(() => guardedAttempts.length === 1);
    guardedSource.emit({ kind: 'update', path: '/queued.md' });
    await until(() => guarded.inspect().queuedBuilds === 1);
    guardedSource.onError!(rescanSignal);
    await until(
      () => guarded.inspect().pendingChanges === 0 && guarded.inspect().queuedBuilds === 1,
    );
    guardedAttempts[0].release();
    await until(() => guardedAttempts.length === 2);
    expect(guardedAttempts[1].request.changes).toEqual([{ kind: 'update', path: '/queued.md' }]);
    guardedAttempts[1].release();
    await until(() => protectedHarness.commit.mock.calls.length === 2);
    attempts[1].release();
    await until(() => h.commit.mock.calls.length === 3);
  });

  it('treats every recorded content input as changed when re-observation fails', async () => {
    const h = harness();
    h.compile.mockImplementation(async (request) => {
      const result = compilation(`test-${request.generation}`);
      result.candidate!.configuration = {
        outputRoot: '/owned',
        cacheRoot: '/cache',
        assetDirectory: 'assets',
        themes: { light: 'light', dark: 'dark' },
        digest: 'configuration',
      };
      result.dependencies = [
        { kind: 'content', path: '/docs/a.md', digest: 'a' },
        { kind: 'content', path: '/owned/index.ts', digest: 'o' },
        { kind: 'existence', path: '/docs/missing.md', exists: false },
      ];
      return result;
    });
    const s = session(h);
    const source = new Events();
    await (
      await s.watch(source, () => {})
    ).initial;
    vi.spyOn(verification, 'changedInputs').mockRejectedValueOnce(new Error('EMFILE'));
    source.onError!(rescanSignal);
    await until(() => h.commit.mock.calls.length === 2);
    expect(h.compile.mock.calls[1][0].changes).toEqual([{ kind: 'update', path: '/docs/a.md' }]);
  });

  it('runs an ordinary generation for a rescan before any committed generation', async () => {
    const h = harness();
    const s = session(h);
    const attempts = blockingCompiler(h);
    const source = new Events();
    const events: BuildEvent[] = [];
    const watch = await s.watch(source, (event) => events.push(event));
    await until(() => attempts.length === 1);
    source.onError!(rescanSignal);
    await until(() => attempts.length === 2);
    expect(attempts[0].signal.aborted).toBe(true);
    expect(attempts[1].request.changes).toEqual([]);
    attempts[1].release();
    expect(await watch.initial).toMatchObject({ status: 'success', generation: 2 });
    expect(events.filter((event) => event.kind === 'diagnostic')).toHaveLength(1);
    await watch.dispose();
    // A late rescan after stopping is ignored.
    source.onError!(rescanSignal);
    expect(h.compile).toHaveBeenCalledTimes(2);
  });

  it('keeps a Parcel dropped-events signal non-fatal, forwards its events and publishes the edit', async () => {
    const root = temporary();
    const page = join(root, 'page.md');
    writeFileSync(page, 'one');
    let callback!: parcel.SubscribeCallback;
    const native = vi.fn(async (_root: string, listener: parcel.SubscribeCallback) => {
      callback = listener;
      return { unsubscribe: async () => {} };
    });
    const errors = vi.fn();
    const forwarded = vi.fn();
    const direct = await createParcelEventSource(root, {}, native).subscribe(forwarded, errors);
    callback(
      new Error('Events were dropped by the FSEvents client. File system must be re-scanned.'),
      [{ type: 'update', path: page }],
    );
    expect(errors).toHaveBeenCalledWith({
      code: WATCHER_RESCAN,
      severity: 'warning',
      stage: 'host',
      message:
        'Events were dropped by the FSEvents client. File system must be re-scanned. Re-observing every recorded input.',
      source: { path: root },
    });
    expect(forwarded).toHaveBeenCalledWith([{ kind: 'update', path: page }]);
    // The watched root arrives with coalesced flags alongside drops; it is never a change.
    callback(null, [{ type: 'create', path: root }]);
    callback(new Error('Too many events. File system must be re-scanned.'), undefined as never);
    expect(errors).toHaveBeenLastCalledWith(expect.objectContaining({ code: WATCHER_RESCAN }));
    callback(new Error('Error starting FSEvents stream'), []);
    expect(errors).toHaveBeenLastCalledWith(
      expect.objectContaining({ code: 'WATCHER_ERROR', severity: 'error' }),
    );
    expect(forwarded).toHaveBeenCalledTimes(1);
    await direct.dispose();

    const h = harness();
    h.compile.mockImplementation(async (request) => ({
      ...compilation(`test-${request.generation}`),
      dependencies: [{ kind: 'content', path: page, digest: digest('one') }],
    }));
    const s = session(h);
    const events: BuildEvent[] = [];
    const watch = await s.watch(createParcelEventSource(root, {}, native), (event) =>
      events.push(event),
    );
    await watch.initial;
    writeFileSync(page, 'two');
    // The overflowing batch carried no event for the edit.
    callback(new Error('Events were dropped by the kernel. File system must be re-scanned.'), []);
    await until(() => h.commit.mock.calls.length === 2);
    expect(h.compile.mock.calls[1][0].changes).toEqual([{ kind: 'update', path: page }]);
    expect(
      events
        .filter((event) => event.kind === 'diagnostic')
        .map((event) => event.kind === 'diagnostic' && event.diagnostic.severity),
    ).toEqual(['warning']);
    expect(s.inspect()).toMatchObject({ watching: true });
  });
});

describe('lossy-watcher classification guard', () => {
  it('pins every non-fatal @parcel/watcher rescan message to WATCHER_RESCAN', async () => {
    // A @parcel/watcher bump that changes these strings must be noticed: an unmatched message
    // fails closed (fatal WATCHER_ERROR), which would crash the watch on a recoverable rescan.
    const native = readFileSync(
      require.resolve('@parcel/watcher/src/macos/FSEventsBackend.cc'),
      'utf8',
    );
    const messages = [...native.matchAll(/list\.error\("([^"]+)"\)/g)].map((match) => match[1]);
    expect(messages).toEqual([
      'Events were dropped by the FSEvents client. File system must be re-scanned.',
      'Events were dropped by the kernel. File system must be re-scanned.',
      'Too many events. File system must be re-scanned.',
    ]);
    let callback!: parcel.SubscribeCallback;
    const errors: Array<{ code: string; severity: string }> = [];
    const subscription = await createParcelEventSource(
      realpathSync(tmpdir()),
      {},
      async (_root, listener) => {
        callback = listener;
        return { unsubscribe: async () => {} };
      },
    ).subscribe(
      () => {},
      (diagnostic) => errors.push(diagnostic),
    );
    for (const message of messages) callback(new Error(message), []);
    // Windows reports a buffer overflow by ending the subscription: it must stay fatal.
    callback(new Error('Buffer overflow. Some events may have been lost.'), []);
    expect(errors.map(({ code, severity }) => `${code}:${severity}`)).toEqual([
      `${WATCHER_RESCAN}:warning`,
      `${WATCHER_RESCAN}:warning`,
      `${WATCHER_RESCAN}:warning`,
      'WATCHER_ERROR:error',
    ]);
    await subscription.dispose();
  });
});
