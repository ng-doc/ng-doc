import { writeFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { BuildEvent, BuildResult, CompilationResult, Diagnostic } from '../../contracts';
import {
  type SessionOptions,
  createBuildSession,
  GeneratorBuildSession,
  SessionLifecycleError,
} from '../build-session';
import { committed, compilation, deferred, Events, harness, until } from './support';

describe('BuildSession lifecycle and serialized commits', () => {
  const sessions: GeneratorBuildSession[] = [];
  function session(h: ReturnType<typeof harness> = harness(), options: SessionOptions = {}) {
    const result = createBuildSession(h.services, { batchDelayMs: 0, ...options });
    sessions.push(result);
    return result;
  }
  afterEach(async () => {
    await Promise.allSettled(sessions.splice(0).map((item) => item.dispose()));
  });

  it('builds once in production, returns complete results and isolates sessions/snapshot mutation', async () => {
    const first = harness('first');
    const second = harness('second');
    const a = session(first);
    const b = session(second);
    const [resultA, resultB] = await Promise.all([
      a.buildOnce(),
      b.buildOnce({ mode: 'development' }),
    ]);
    expect(resultA.status).toBe('success');
    expect(resultB.status).toBe('success');
    expect(first.compile.mock.calls[0][0]).toEqual({
      generation: 1,
      mode: 'production',
      changes: [],
    });
    expect(second.compile.mock.calls[0][0].mode).toBe('development');
    if (resultA.status !== 'success') throw new Error('Expected success');
    resultA.snapshot.revision = 'consumer-mutation';
    first.compile.mockImplementationOnce(async (request) => {
      expect(request.previous?.revision).toBe('first-1');
      request.previous!.revision = 'compiler-mutation';
      throw new Error('failed generation');
    });
    expect(await a.buildOnce()).toMatchObject({ status: 'failure', lastGoodRevision: 'first-1' });
    expect(b.inspect().lastGoodRevision).toBe('second-1');
    const disposeA = a.dispose();
    expect(a.dispose()).toBe(disposeA);
    await disposeA;
    expect(first.compilerDispose).toHaveBeenCalledTimes(1);
    expect(first.committerDispose).toHaveBeenCalledTimes(1);
    expect(second.compilerDispose).not.toHaveBeenCalled();
    await expect(a.buildOnce()).rejects.toBeInstanceOf(SessionLifecycleError);
    // Nothing to reconcile once disposed: both return without work, as without a watch.
    await expect(a.rescan()).resolves.toBeUndefined();
    await expect(a.reconcileInputs(['/later.md'])).resolves.toBeUndefined();
    expect(first.compile).toHaveBeenCalledTimes(2);
    await expect(a.watch(new Events(), () => {})).rejects.toBeInstanceOf(SessionLifecycleError);
  });

  it('publishes a cloned current dependency projection on success and failure branches', async () => {
    const h = harness();
    const s = session(h);
    const dependencies = [
      { kind: 'content' as const, path: '/shared/missing.nunj', digest: 'one' },
      { kind: 'glob' as const, root: '/shared', include: ['**/*.md'], exclude: [], members: [] },
    ];
    h.compile.mockResolvedValueOnce({
      ...compilation('error'),
      dependencies,
      diagnostics: [{ code: 'BROKEN', severity: 'error', stage: 'content', message: 'broken' }],
    });
    const failed = await s.buildOnce();
    expect(failed).toMatchObject({
      status: 'failure',
      watchInputs: {
        files: ['/shared/missing.nunj'],
        globs: [{ root: '/shared', include: ['**/*.md'], exclude: [] }],
      },
    });
    if (failed.status === 'cancelled' || !failed.watchInputs)
      throw new Error('Expected watch inputs');
    failed.watchInputs.files.push('/consumer-mutation');
    failed.watchInputs.globs[0].include.push('mutated');
    const success = await s.buildOnce();
    expect(success).toMatchObject({ status: 'success', watchInputs: { files: [], globs: [] } });
    if (success.status !== 'success' || !success.watchInputs)
      throw new Error('Expected watch inputs');
    expect(success.watchInputs.files).not.toContain('/consumer-mutation');
  });

  it.each(['no candidate', 'commit failed', 'commit throw', 'commit protocol'] as const)(
    'carries a valid projection through %s',
    async (branch) => {
      const h = harness();
      const s = session(h);
      h.compile.mockResolvedValueOnce({
        ...compilation('attempt'),
        dependencies: [{ kind: 'existence', path: '/missing/file.njk', exists: false }],
        ...(branch === 'no candidate' ? { candidate: undefined } : {}),
      });
      if (branch === 'commit failed')
        h.commit.mockResolvedValueOnce({ status: 'failed', diagnostics: [] });
      if (branch === 'commit throw') h.commit.mockRejectedValueOnce(new Error('write failed'));
      if (branch === 'commit protocol')
        h.commit.mockImplementationOnce(async (request) => {
          const result = committed(request);
          if (result.status === 'committed') result.manifest.generation++;
          return result;
        });
      await expect(s.buildOnce()).resolves.toMatchObject({
        status: 'failure',
        watchInputs: { files: ['/missing/file.njk'], globs: [] },
      });
    },
  );

  it('omits projection for malformed compiler DTOs, throws, stale attempts and disposal', async () => {
    const h = harness();
    const s = session(h);
    h.compile.mockResolvedValueOnce({
      ...compilation('bad'),
      dependencies: [{ kind: 'content', path: 'relative.md', digest: 'bad' }],
    });
    await expect(s.buildOnce()).resolves.toMatchObject({
      status: 'failure',
      diagnostics: [{ code: 'SESSION_WATCH_INPUTS' }],
    });
    h.compile.mockRejectedValueOnce(new Error('compiler crashed'));
    const thrown = await s.buildOnce();
    expect(thrown).toMatchObject({
      status: 'failure',
      diagnostics: [{ code: 'SESSION_COMPILER_THROW' }],
    });
    expect(thrown).not.toHaveProperty('watchInputs');
    const gate = deferred<CompilationResult>();
    h.compile.mockImplementationOnce(() => gate.promise);
    const pending = s.buildOnce();
    await until(() => h.compile.mock.calls.length === 3);
    const disposed = s.dispose();
    gate.resolve({
      ...compilation('late'),
      dependencies: [{ kind: 'content', path: '/late.md', digest: 'late' }],
    });
    await expect(pending).resolves.not.toHaveProperty('watchInputs');
    await disposed;
  });

  it('omits a stale projection and isolates observer result mutation from watch readiness', async () => {
    const h = harness();
    const s = session(h);
    h.compile.mockResolvedValueOnce({
      ...compilation('stale'),
      dependencies: [{ kind: 'content', path: '/stale.md', digest: 'one' }],
    });
    h.commit.mockResolvedValueOnce({ status: 'stale', diagnostics: [] });
    const stale = await s.buildOnce();
    expect(stale).toMatchObject({ status: 'cancelled' });
    expect(stale).not.toHaveProperty('watchInputs');

    const source = new Events();
    const handle = await s.watch(source, (event) => {
      if (event.kind === 'result' && event.result.status !== 'cancelled')
        event.result.watchInputs?.files.push('/observer-mutation');
    });
    const initial = await handle.initial;
    expect(initial).toMatchObject({ status: 'success', watchInputs: { files: [], globs: [] } });
    if (initial.status === 'cancelled') throw new Error('Expected successful readiness');
    expect(initial.watchInputs?.files).not.toContain('/observer-mutation');
    await handle.dispose();
  });

  it('keeps watch readiness with a superseding native batch until its first settled result', async () => {
    const h = harness();
    const s = session(h);
    const source = new Events();
    const events: BuildEvent[] = [];
    const initial = deferred<CompilationResult>();
    h.compile.mockImplementationOnce(() => initial.promise);
    const watch = await s.watch(source, (event) => events.push(event));
    await until(() => h.compile.mock.calls.length === 1);
    source.emit({ kind: 'create', path: '/tmp/a.md' }, { kind: 'update', path: '/tmp/a.md' });
    source.emit({ kind: 'delete', path: '/tmp/b.md' }, { kind: 'create', path: '/tmp/c.md' });
    await until(() => s.inspect().queuedBuilds === 1);
    expect(h.commit).not.toHaveBeenCalled();
    expect(h.compile).toHaveBeenCalledTimes(1);
    initial.resolve(compilation('initial'));
    await until(() => h.commit.mock.calls.length === 1);
    expect(await watch.initial).toMatchObject({ status: 'success', generation: 2 });
    expect(h.compile.mock.calls[1][0]).toMatchObject({
      generation: 2,
      mode: 'development',
      changes: [
        { kind: 'update', path: '/tmp/a.md' },
        { kind: 'delete', path: '/tmp/b.md' },
        { kind: 'create', path: '/tmp/c.md' },
      ],
    });
    expect(h.compile.mock.calls[0][1].aborted).toBe(true);
    expect(h.compile.mock.calls[1][0]).not.toHaveProperty('previous');
    expect(h.commit.mock.calls[0][0].candidate.revision).toBe('test-2');
    expect(events.map((event) => event.kind)).toEqual(['started', 'result', 'started', 'result']);
    expect(s.inspect()).toMatchObject({ queuedBuilds: 0, pendingChanges: 0, building: false });
  });

  it.each(['stop', 'dispose'] as const)(
    'cancels watch readiness during a superseded startup chain on %s',
    async (action) => {
      const h = harness();
      const s = session(h);
      const source = new Events();
      const gate = deferred<CompilationResult>();
      h.compile.mockImplementationOnce(() => gate.promise);
      const watch = await s.watch(source, () => {});
      await until(() => h.compile.mock.calls.length === 1);
      source.emit({ kind: 'update', path: '/startup.md' });
      await until(() => h.compile.mock.calls[0][1].aborted);

      const stopped = action === 'stop' ? watch.dispose() : s.dispose();
      expect((await watch.initial).status).toBe('cancelled');
      gate.resolve(compilation('superseded'));
      await stopped;

      expect(h.compile).toHaveBeenCalledTimes(1);
      expect(h.commit).not.toHaveBeenCalled();
      expect(source.closed).toBe(1);
    },
  );

  it('rejects stale delayed compilation after watch stop, and restarts without inheriting state', async () => {
    const h = harness();
    const s = session(h);
    const source = new Events();
    const gate = deferred<CompilationResult>();
    h.compile.mockImplementationOnce(() => gate.promise);
    const handle = await s.watch(source, () => {});
    await until(() => h.compile.mock.calls.length === 1);
    const stop = handle.dispose();
    expect(handle.dispose()).toBe(stop);
    expect(h.compile.mock.calls[0][1].aborted).toBe(true);
    gate.resolve(compilation('stale'));
    await stop;
    expect((await handle.initial).status).toBe('cancelled');
    expect(h.commit).not.toHaveBeenCalled();
    expect(source.closed).toBe(1);
    source.emit({ kind: 'update', path: '/ignored.md' });
    const restarted = await s.watch(new Events(), () => {});
    expect((await restarted.initial).status).toBe('success');
    expect(h.compile).toHaveBeenCalledTimes(2);
    expect(h.compile.mock.calls[1][0]).not.toHaveProperty('previous');
  });

  it('carries cancelled filesystem changes forward without merging an independent buildOnce', async () => {
    const h = harness();
    const s = session(h);
    const source = new Events();
    const watch = await s.watch(source, () => {});
    await watch.initial;
    const gate = deferred<CompilationResult>();
    h.compile.mockImplementationOnce(() => gate.promise);
    source.emit({ kind: 'update', path: '/a.md' });
    await until(() => h.compile.mock.calls.length === 2);
    const requested = s.buildOnce({ mode: 'development' });
    source.emit({ kind: 'delete', path: '/a.md' }, { kind: 'create', path: '/b.md' });
    await until(() => s.inspect().queuedBuilds === 1);
    source.emit({ kind: 'update', path: '/c.md' });
    await until(() => s.inspect().pendingChanges === 0);
    gate.resolve(compilation('cancelled-a'));
    expect((await requested).status).toBe('success');
    await until(() => h.commit.mock.calls.length === 3);
    expect(h.compile.mock.calls[2][0]).toMatchObject({
      previous: { revision: 'test-1' },
      changes: [
        { kind: 'delete', path: '/a.md' },
        { kind: 'create', path: '/b.md' },
        { kind: 'update', path: '/c.md' },
      ],
      contentRequest: { origin: 'filesystem' },
    });
    // The buildOnce ran after the watch batch, on its commit, with nothing of the batch merged.
    expect(h.compile.mock.calls[3][0]).toEqual({
      generation: 4,
      mode: 'development',
      changes: [],
      previous: expect.objectContaining({ revision: 'test-3' }),
    });
    expect(h.commit.mock.calls.map(([request]) => request.candidate.revision)).toEqual([
      'test-1',
      'test-3',
      'test-4',
    ]);
  });

  it('keeps an explicit buildOnce independent while a watch change queues afterward', async () => {
    const h = harness();
    const s = session(h);
    const source = new Events();
    const watch = await s.watch(source, () => {});
    await watch.initial;
    const gate = deferred<CompilationResult>();
    h.compile.mockImplementationOnce(() => gate.promise);
    const once = s.buildOnce();
    await until(() => h.compile.mock.calls.length === 2);
    source.emit({ kind: 'update', path: '/a.md' });
    await until(() => s.inspect().queuedBuilds === 1);
    expect(h.compile.mock.calls[1][1].aborted).toBe(false);
    gate.resolve(compilation('explicit-production'));
    expect((await once).status).toBe('success');
    await until(() => h.commit.mock.calls.length === 3);
    expect(h.compile.mock.calls[2][0]).toMatchObject({
      mode: 'development',
      previous: { revision: 'explicit-production' },
      changes: [{ kind: 'update', path: '/a.md' }],
    });
  });

  it('rechecks a live generation guard while a delayed commit is in flight', async () => {
    const h = harness();
    const s = session(h);
    const gate = deferred<void>();
    h.commit.mockImplementationOnce(async (request, guard, signal) => {
      expect(guard.isCurrent(request.generation)).toBe(true);
      await gate.promise;
      expect(signal.aborted).toBe(true);
      expect(guard.isCurrent(request.generation)).toBe(false);
      return committed(request); // A misbehaving committer must not update session last-good state.
    });
    const result = s.buildOnce();
    await until(() => h.commit.mock.calls.length === 1);
    const disposed = s.dispose();
    gate.resolve();
    expect((await result).status).toBe('cancelled');
    await disposed;
    expect(s.inspect()).toMatchObject({ disposed: true, building: false, queuedBuilds: 0 });
    expect(s.inspect()).not.toHaveProperty('lastGoodRevision');
  });

  it('preserves last-good state across diagnostics, commit failure and recovery', async () => {
    const h = harness();
    const s = session(h);
    const source = new Events();
    const results: BuildResult[] = [];
    const watch = await s.watch(source, (event) => {
      if (event.kind === 'result') results.push(event.result);
    });
    await watch.initial;
    const error: Diagnostic = {
      code: 'MISSING_INCLUDE',
      severity: 'error',
      stage: 'content',
      message: 'missing include',
    };
    h.compile.mockResolvedValueOnce({
      dependencies: [{ kind: 'existence', path: '/missing.nunj', exists: false }],
      diagnostics: [error],
      whyRebuilt: [],
    });
    source.emit({ kind: 'update', path: '/page.md' });
    await until(() => results.length === 2);
    expect(results[1]).toMatchObject({
      status: 'failure',
      diagnostics: [error],
      lastGoodRevision: 'test-1',
    });
    h.commit.mockResolvedValueOnce({ status: 'failed', diagnostics: [] });
    source.emit({ kind: 'create', path: '/missing.nunj' });
    await until(() => results.length === 3);
    expect(results[2]).toMatchObject({
      status: 'failure',
      lastGoodRevision: 'test-1',
      diagnostics: [{ code: 'SESSION_COMMIT_FAILED' }],
    });
    source.emit({ kind: 'update', path: '/page.md' });
    await until(() => results.length === 4);
    expect(results[3].status).toBe('success');
    expect(h.compile.mock.calls[3][0].previous?.revision).toBe('test-1');
    expect(h.commit.mock.calls[2][0].previous?.revision).toBe('test-1');
    expect(s.inspect().lastGoodRevision).toBe('test-4');
  });

  it('closes late native subscriptions after dispose and settles the initial result', async () => {
    const h = harness();
    const s = session(h);
    const source = new Events();
    const gate = deferred<void>();
    source.gate = gate.promise;
    const handle = await s.watch(source, () => {});
    await until(() => source.subscribed === 1);
    source.emit({ kind: 'create', path: '/before-ready.md' });
    const disposed = s.dispose();
    gate.resolve();
    await disposed;
    expect((await handle.initial).status).toBe('cancelled');
    expect(source.closed).toBe(1);
    expect(h.compile).not.toHaveBeenCalled();
    expect(s.inspect()).toMatchObject({ watching: false, pendingChanges: 0 });
  });

  it('handles subscription rejection and reports watcher errors without breaking recovery', async () => {
    const h = harness();
    const diagnostics: Diagnostic[] = [];
    const s = session(h, { onDiagnostic: (d: Diagnostic) => diagnostics.push(d) });
    const source = new Events();
    source.gate = Promise.reject(new Error('subscribe failed'));
    const failed = await s.watch(source, () => {});
    expect(await failed.initial).toMatchObject({
      status: 'failure',
      diagnostics: [{ code: 'SESSION_WATCH_SUBSCRIBE' }],
    });
    await failed.dispose();
    expect(diagnostics[0].code).toBe('SESSION_WATCH_SUBSCRIBE');
    const live = new Events();
    const events: BuildEvent[] = [];
    const watching = await s.watch(live, (event) => events.push(event));
    await watching.initial;
    await expect(s.watch(new Events(), () => {})).rejects.toMatchObject({
      diagnostic: { code: 'SESSION_ALREADY_WATCHING' },
    });
    live.onError!({
      code: 'NATIVE',
      severity: 'error',
      stage: 'host',
      message: 'temporary watcher failure',
    });
    live.emit();
    live.emit({ kind: 'update', path: '/recovery.md' });
    await until(() => h.compile.mock.calls.length === 2);
    expect(events).toContainEqual({
      kind: 'diagnostic',
      diagnostic: {
        code: 'NATIVE',
        severity: 'error',
        stage: 'host',
        message: 'temporary watcher failure',
      },
    });
    await watching.dispose();
    live.onError!({ code: 'LATE', severity: 'error', stage: 'host', message: 'ignored' });
    expect(
      events.some((event) => event.kind === 'diagnostic' && event.diagnostic.code === 'LATE'),
    ).toBe(false);
  });

  it('can buildOnce then watch then stop/restart; a rescan needs an active watch', async () => {
    const h = harness();
    const s = session(h);
    await s.buildOnce();
    await s.rescan();
    await s.reconcileInputs(['/a.md']);
    expect(s.inspect()).toMatchObject({ queuedBuilds: 0, pendingChanges: 0, building: false });
    expect(h.compile).toHaveBeenCalledTimes(1);
    const source = new Events();
    const handle = await s.watch(source, () => {});
    await handle.initial;
    await handle.dispose();
    await s.rescan();
    expect(h.compile).toHaveBeenCalledTimes(2);
    await s.buildOnce();
    const again = await s.watch(new Events(), () => {});
    expect((await again.initial).status).toBe('success');
    expect(source.closed).toBe(1);
  });

  it('retains events observed during subscribe and cancels a pending rescan and timers at stop', async () => {
    const h = harness();
    const s = session(h, { batchDelayMs: 1000 });
    const source = new Events();
    const gate = deferred<void>();
    source.gate = gate.promise;
    const handle = await s.watch(source, () => {});
    await until(() => source.subscribed === 1);
    source.emit({ kind: 'create', path: '/new.md' });
    gate.resolve();
    await handle.initial;
    expect(h.compile.mock.calls[0][0].changes).toEqual([{ kind: 'create', path: '/new.md' }]);
    await s.rescan();
    source.emit({ kind: 'update', path: '/new.md' });
    expect(s.inspect().pendingChanges).toBe(1);
    await handle.dispose();
    expect(s.inspect()).toMatchObject({
      queuedBuilds: 0,
      pendingChanges: 0,
      pendingWatchWaiters: 0,
    });
    expect(h.compile).toHaveBeenCalledTimes(1);
  });

  it('contains observer failures, stops its watcher and survives a failing fallback', async () => {
    const h = harness();
    const fallback = vi.fn(() => {
      throw new Error('fallback too');
    });
    const s = session(h, { onDiagnostic: fallback });
    const source = new Events();
    const watch = await s.watch(source, () => {
      throw new Error('observer failed');
    });
    expect((await watch.initial).status).toBe('cancelled');
    await watch.dispose();
    expect(source.closed).toBe(1);
    expect(fallback).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'SESSION_OBSERVER_FAILED' }),
    );
    expect(h.compile).not.toHaveBeenCalled();
    expect((await s.buildOnce()).status).toBe('success');
  });

  it('reports teardown errors after attempting every owned resource and handles disposed-event faults', async () => {
    const h = harness();
    const fallback = vi.fn();
    const s = session(h, { onDiagnostic: fallback });
    const source = new Events();
    source.closeError = new Error('native close');
    h.compilerDispose.mockRejectedValueOnce(new Error('compiler close'));
    const watch = await s.watch(source, (event) => {
      if (event.kind === 'disposed') throw new Error('disposed observer');
    });
    await watch.initial;
    await expect(s.dispose()).rejects.toMatchObject({
      diagnostic: { code: 'SESSION_DISPOSE_FAILED' },
    });
    expect(h.compilerDispose).toHaveBeenCalledTimes(1);
    expect(h.committerDispose).toHaveBeenCalledTimes(1);
    expect(source.closed).toBe(1);
    expect(s.inspect().disposed).toBe(true);
    expect(fallback).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'SESSION_OBSERVER_FAILED' }),
    );
  });

  it.each(['started', 'disposed'])(
    'contains async %s observer rejection and async diagnostic rejection',
    async (phase) => {
      const h = harness();
      const fallback = vi.fn(async () => {
        throw new Error('async fallback');
      });
      const s = session(h, { onDiagnostic: fallback });
      const source = new Events();
      const watch = await s.watch(source, async (event) => {
        if (event.kind === phase) throw new Error('async observer');
      });
      await watch.initial;
      if (phase === 'started') await watch.dispose();
      await s.dispose();
      await until(() => fallback.mock.calls.length > 0);
      expect(source.closed).toBe(1);
      expect(s.inspect().building).toBe(false);
    },
  );

  it('bounds queued builds and watch waiters across successive flush windows behind slow work', async () => {
    const h = harness();
    const s = session(h, { maxQueuedBuilds: 3 });
    const gate = deferred<CompilationResult>();
    h.compile.mockImplementationOnce(() => gate.promise);
    const source = new Events();
    const watch = await s.watch(source, () => {});
    await until(() => h.compile.mock.calls.length === 1);
    const a = s.buildOnce({ mode: 'development' });
    source.emit({ kind: 'update', path: '/a.md' });
    // The watch batch is queued ahead of the explicit build.
    await until(() => s.inspect().queuedBuilds === 2);
    const b = s.buildOnce();
    source.emit({ kind: 'delete', path: '/a.md' }, { kind: 'create', path: '/b.md' });
    await until(() => s.inspect().queuedBuilds === 3 && s.inspect().pendingChanges === 0);
    expect(s.inspect().pendingWatchWaiters).toBe(1);
    await expect(s.buildOnce()).rejects.toMatchObject({
      diagnostic: { code: 'SESSION_QUEUE_FULL' },
    });
    gate.resolve(compilation('slow'));
    await watch.initial;
    await Promise.all([a, b]);
    expect(h.compile.mock.calls.slice(1).map(([request]) => request.mode)).toEqual([
      'development',
      'development',
      'production',
    ]);
    expect(h.compile.mock.calls[1][0].changes).toEqual([
      { kind: 'delete', path: '/a.md' },
      { kind: 'create', path: '/b.md' },
    ]);
    expect(s.inspect().pendingWatchWaiters).toBe(0);
    await watch.dispose();
    const slow = deferred<CompilationResult>();
    h.compile.mockImplementationOnce(() => slow.promise);
    const active = s.buildOnce();
    await until(() => s.inspect().building);
    const queued = [s.buildOnce(), s.buildOnce(), s.buildOnce()];
    await expect(s.buildOnce()).rejects.toMatchObject({
      diagnostic: { code: 'SESSION_QUEUE_FULL' },
    });
    const disposed = s.dispose();
    slow.resolve(compilation('too late'));
    expect((await active).status).toBe('cancelled');
    expect((await Promise.all(queued)).every((result) => result.status === 'cancelled')).toBe(true);
    await disposed;
  });

  it.each([
    ['missing candidate', {}],
    ['non-JSON callback', { candidate: { ...compilation('bad').candidate!, extra: () => {} } }],
    [
      'artifact diagnostic',
      {
        candidate: {
          ...compilation('bad').candidate!,
          artifacts: [
            {
              diagnostics: [
                {
                  code: 'ARTIFACT',
                  severity: 'error',
                  stage: 'content',
                  message: 'artifact failed',
                },
              ],
            },
          ],
        },
      },
    ],
  ])('fails %s before commit and permits another attempt', async (_name, patch) => {
    const h = harness();
    const s = session(h);
    h.compile.mockResolvedValueOnce({
      dependencies: [],
      diagnostics: [],
      whyRebuilt: [],
      ...patch,
    } as CompilationResult);
    expect((await s.buildOnce()).status).toBe('failure');
    expect(h.commit).not.toHaveBeenCalled();
    expect((await s.buildOnce()).status).toBe('success');
  });

  it.each([
    'throw',
    'stale',
    'error-diagnostic',
    'manifest-generation',
    'manifest-project',
    'manifest-revision',
    'failed-with-diagnostic',
  ])('handles commit %s', async (failure) => {
    const h = harness();
    const s = session(h);
    h.commit.mockImplementationOnce(async (request) => {
      if (failure === 'throw') throw 'plain thrown text';
      if (failure === 'stale') return { status: 'stale', diagnostics: [] };
      if (failure === 'failed-with-diagnostic')
        return {
          status: 'failed',
          diagnostics: [
            { code: 'WRITE', severity: 'error', stage: 'commit', message: 'write failed' },
          ],
        };
      const result = committed(request);
      if (result.status !== 'committed') throw new Error('fixture');
      if (failure === 'error-diagnostic')
        result.diagnostics = [
          { code: 'WRITE', severity: 'error', stage: 'commit', message: 'write failed' },
        ];
      if (failure === 'manifest-generation') result.manifest.generation++;
      if (failure === 'manifest-project') result.manifest.projectId = 'wrong';
      if (failure === 'manifest-revision') result.manifest.revision = 'wrong';
      return result;
    });
    expect((await s.buildOnce()).status).toBe(failure === 'stale' ? 'cancelled' : 'failure');
    expect(s.inspect()).not.toHaveProperty('lastGoodRevision');
  });

  it('keeps a warning successful, normalizes unusual thrown values and cancels abort failures', async () => {
    const h = harness();
    const s = session(h);
    h.compile.mockResolvedValueOnce({
      ...compilation('warning'),
      diagnostics: [{ code: 'WARNING', severity: 'warning', stage: 'content', message: 'allowed' }],
    });
    expect((await s.buildOnce()).status).toBe('success');
    h.compile.mockRejectedValueOnce({
      toString() {
        throw new Error('cannot stringify');
      },
    });
    expect(await s.buildOnce()).toMatchObject({
      status: 'failure',
      diagnostics: [{ message: 'Unknown error' }],
    });
    const gate = deferred<CompilationResult>();
    h.compile.mockImplementationOnce(() => gate.promise);
    const result = s.buildOnce();
    await until(() => h.compile.mock.calls.length === 3);
    const disposed = s.dispose();
    gate.reject(new Error('aborted compiler'));
    expect((await result).status).toBe('cancelled');
    await disposed;
  });

  it.each([
    { batchDelayMs: -1 },
    { batchDelayMs: Infinity },
    { maxQueuedBuilds: 0 },
    { maxQueuedBuilds: 1.5 },
  ])('rejects invalid options %p', (options) => {
    expect(() => createBuildSession(harness().services, options)).toThrow(SessionLifecycleError);
  });

  it('retains a native batch when explicit requests fill the queue', async () => {
    const h = harness();
    const s = session(h, { maxQueuedBuilds: 1 });
    const gate = deferred<CompilationResult>();
    h.compile.mockImplementationOnce(() => gate.promise);
    const active = s.buildOnce();
    await until(() => h.compile.mock.calls.length === 1);
    const queued = s.buildOnce();
    const source = new Events();
    const watch = await s.watch(source, () => {});
    await until(() => source.subscribed === 1);
    source.emit({ kind: 'create', path: '/retained.md' });
    await until(() => s.inspect().pendingChanges === 1);
    gate.resolve(compilation('first'));
    await active;
    await queued;
    await watch.initial;
    expect(h.compile.mock.calls[2][0].changes).toEqual([{ kind: 'create', path: '/retained.md' }]);
  });

  it('cancels a queued watch batch while waiting for a signal-ignoring compiler', async () => {
    const h = harness();
    const s = session(h);
    const gate = deferred<CompilationResult>();
    h.compile.mockImplementationOnce(() => gate.promise);
    const source = new Events();
    const watch = await s.watch(source, () => {});
    await until(() => h.compile.mock.calls.length === 1);
    source.emit({ kind: 'update', path: '/queued.md' });
    await until(() => s.inspect().queuedBuilds === 1);
    const stop = watch.dispose();
    gate.resolve(compilation('stale'));
    await stop;
    expect((await watch.initial).status).toBe('cancelled');
    expect(s.inspect().queuedBuilds).toBe(0);
    expect(h.compile).toHaveBeenCalledTimes(1);
    expect(h.commit).not.toHaveBeenCalled();
  });

  it('settles queue state when an injected source provides an uncloneable event', async () => {
    const h = harness();
    const s = session(h);
    const source = new Events();
    const results: BuildResult[] = [];
    const watch = await s.watch(source, (event) => {
      if (event.kind === 'result') results.push(event.result);
    });
    await watch.initial;
    const malformed = { kind: 'update' as const, path: '/bad.md', unexpected: () => {} };
    source.emit(malformed);
    await until(() => results.length === 2);
    expect(results[1]).toMatchObject({
      status: 'failure',
      diagnostics: [{ code: 'SESSION_INVALID_RESULT' }],
    });
    expect(s.inspect().building).toBe(false);
    expect((await s.buildOnce()).status).toBe('success');
    await watch.dispose();
  });

  it('does not publish a rejected late subscription after stopping', async () => {
    const h = harness();
    const s = session(h);
    const source = new Events();
    const gate = deferred<void>();
    const events: BuildEvent[] = [];
    source.gate = gate.promise;
    const watch = await s.watch(source, (event) => events.push(event));
    await until(() => source.subscribed === 1);
    const stop = watch.dispose();
    gate.reject(new Error('late subscribe failure'));
    await stop;
    expect(events).toEqual([]);
    expect((await watch.initial).status).toBe('cancelled');
  });

  it('releases state through 100 sessions and 100 sequential watch edits', async () => {
    const trace: Array<Record<string, unknown>> = [];
    for (let index = 0; index < 100; index++) {
      const h = harness();
      const s = createBuildSession(h.services);
      await s.buildOnce();
      await s.dispose();
      expect(h.compilerDispose).toHaveBeenCalledTimes(1);
      expect(h.committerDispose).toHaveBeenCalledTimes(1);
      expect(s.inspect()).toMatchObject({
        watching: false,
        building: false,
        queuedBuilds: 0,
        pendingChanges: 0,
        pendingWatchWaiters: 0,
      });
      trace.push({
        phase: 'disposed-session',
        iteration: index + 1,
        state: s.inspect(),
        memory: process.memoryUsage(),
        compilerDisposals: h.compilerDispose.mock.calls.length,
        committerDisposals: h.committerDispose.mock.calls.length,
      });
    }
    const h = harness();
    const s = session(h);
    const source = new Events();
    const watch = await s.watch(source, () => {});
    await watch.initial;
    for (let index = 0; index < 100; index++) {
      source.emit({ kind: 'update', path: `/file-${index}.md` });
      await until(() => h.commit.mock.calls.length === index + 2 && !s.inspect().building);
      expect(s.inspect()).toMatchObject({
        queuedBuilds: 0,
        pendingChanges: 0,
        pendingWatchWaiters: 0,
      });
      expect(h.compile.mock.calls[index + 1][0].changes).toEqual([
        { kind: 'update', path: `/file-${index}.md` },
      ]);
      trace.push({
        phase: 'watch-edit',
        iteration: index + 1,
        state: s.inspect(),
        memory: process.memoryUsage(),
        subscriptions: source.subscribed,
        closures: source.closed,
      });
    }
    await watch.dispose();
    expect(source.subscribed).toBe(1);
    expect(source.closed).toBe(1);
    trace.push({
      phase: 'watch-stopped',
      state: s.inspect(),
      memory: process.memoryUsage(),
      subscriptions: source.subscribed,
      closures: source.closed,
    });
    if (process.env['NG_DOC_T08_TRACE_FILE']) {
      writeFileSync(
        process.env['NG_DOC_T08_TRACE_FILE'],
        JSON.stringify(
          { node: process.version, platform: process.platform, arch: process.arch, trace },
          null,
          2,
        ),
      );
    }
  });
});
