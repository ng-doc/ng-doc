/** @vitest-environment node */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  BuildEvent,
  CompilationContext,
  CompilationRequest,
  CompilationResult,
} from '../../contracts';
import { type SessionOptions, createBuildSession, GeneratorBuildSession } from '../build-session';
import {
  compilation,
  deferred,
  Events,
  harness,
  hostJoin,
  temporaryDirectory,
  until,
} from './support';

/**
 * After a watch reuses the verified development buildOnce baseline (compiled by a one-shot
 * runtime), the session asks a compiler with a long-lived runtime to warm it with a no-change
 * development request for the committed snapshot. The warm-up is invisible: no generation number,
 * no commit, no event, no result; any real work supersedes it.
 */
const digest = (value: string) => createHash('sha256').update(value).digest('hex');

type Prime = (request: CompilationRequest, signal: AbortSignal) => Promise<unknown>;

describe('priming the compiler runtime after a reused startup baseline', () => {
  const sessions: GeneratorBuildSession[] = [];
  const roots: string[] = [];
  afterEach(async () => {
    await Promise.allSettled(sessions.splice(0).map((item) => item.dispose()));
    roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }));
  });

  /** A compiler that reports a real content observation, so the baseline can be verified. */
  function setup(prime?: Prime, options: SessionOptions = {}) {
    const root = temporaryDirectory('ngdoc-priming-');
    roots.push(root);
    mkdirSync(hostJoin(root, 'docs'), { recursive: true });
    const page = hostJoin(root, 'docs/page.md');
    writeFileSync(page, 'initial body');
    const h = harness();
    const contexts: Array<CompilationContext | undefined> = [];
    h.compile.mockImplementation((async (
      request: CompilationRequest,
      _signal: AbortSignal,
      context?: CompilationContext,
    ): Promise<CompilationResult> => {
      contexts.push(context);
      const body = readFileSync(page, 'utf8');
      const result = compilation(`${request.generation}:${body}`);
      result.dependencies = [{ kind: 'content', path: page, digest: digest(body) }];
      return result;
    }) as never);
    const calls: Array<{ request: CompilationRequest; signal: AbortSignal }> = [];
    const primeMock = vi.fn(async (request: CompilationRequest, signal: AbortSignal) => {
      calls.push({ request, signal });
      return prime
        ? prime(request, signal)
        : { status: 'primed', revision: request.previous?.revision };
    });
    const compiler = h.services.compiler as typeof h.services.compiler & { prime?: Prime };
    compiler.prime = primeMock;
    compiler.watching = vi.fn();
    const s = createBuildSession(h.services, { batchDelayMs: 0, ...options });
    sessions.push(s);
    return { root, page, h, s, calls, primeMock, contexts };
  }

  it('warms the runtime once with a no-change development request for the committed snapshot, and never commits, publishes or emits', async () => {
    const { h, s, calls, page } = setup();
    const built = await s.buildOnce({ mode: 'development' });
    const events: BuildEvent[] = [];
    const watch = await s.watch(new Events(), (event) => events.push(event));
    expect(await watch.initial).toEqual(built);
    await until(() => s.inspect().priming === 'primed');
    expect(calls).toHaveLength(1);
    const { request, signal } = calls[0];
    expect(request).toEqual({
      generation: 1,
      mode: 'development',
      changes: [],
      previous: built.status === 'success' ? built.snapshot : undefined,
    });
    // A private copy of the committed snapshot.
    expect(request.previous).not.toBe((s as unknown as { snapshot: unknown }).snapshot);
    expect(signal.aborted).toBe(false);
    // Nothing reached the committer, the observer or the generation counter.
    expect(h.compile).toHaveBeenCalledTimes(1);
    expect(h.commit).toHaveBeenCalledTimes(1);
    expect(events).toEqual([]);
    expect(s.inspect()).toMatchObject({
      generation: 1,
      building: false,
      lastGoodRevision: '1:initial body',
    });
    await watch.dispose();
    expect(calls).toHaveLength(1);
    expect(readFileSync(page, 'utf8')).toBe('initial body');
  });

  it('lets the first edit supersede a running warm-up at once, before its batch runs', async () => {
    const release = deferred<unknown>();
    const { h, s, calls, page, contexts } = setup(() => release.promise);
    await s.buildOnce({ mode: 'development' });
    const source = new Events();
    const events: BuildEvent[] = [];
    const watch = await s.watch(source, (event) => events.push(event));
    await watch.initial;
    await until(() => calls.length === 1);
    expect(s.inspect().priming).toBe('running');
    writeFileSync(page, 'edited body');
    source.emit({ kind: 'update', path: page });
    // Aborted synchronously with the admitted change.
    expect(calls[0].signal.aborted).toBe(true);
    await until(() => events.some((event) => event.kind === 'result'));
    expect(h.compile).toHaveBeenCalledTimes(2);
    expect(h.compile.mock.calls[1][0]).toMatchObject({
      generation: 2,
      changes: [{ kind: 'update', path: page }],
      previous: { revision: '1:initial body' },
    });
    expect(contexts[1]).toEqual({ lifetime: 'watch' });
    release.resolve({ status: 'aborted' });
    await until(() => s.inspect().priming === 'aborted');
    await watch.dispose();
  });

  it.each([
    ['a rescan', (s: GeneratorBuildSession) => void s.rescan()],
    ['a production buildOnce', (s: GeneratorBuildSession) => void s.buildOnce()],
    [
      'the watch stopping',
      (_s: GeneratorBuildSession, dispose: () => Promise<void>) => void dispose(),
    ],
    ['dispose', (s: GeneratorBuildSession) => void s.dispose()],
  ])('is superseded by %s', async (_name, act) => {
    const { s, calls } = setup(() => new Promise(() => {}));
    await s.buildOnce({ mode: 'development' });
    const watch = await s.watch(new Events(), () => {});
    await watch.initial;
    await until(() => calls.length === 1);
    act(s, watch.dispose);
    expect(calls[0].signal.aborted).toBe(true);
    await watch.dispose();
  });

  it('does not warm without a reused baseline, for production or plain buildOnce, or without the hook', async () => {
    // A watch without a baseline generates in the long-lived runtime itself.
    const plain = setup();
    const first = await plain.s.watch(new Events(), () => {});
    expect(await first.initial).toMatchObject({ status: 'success', generation: 1 });
    await first.dispose();
    expect(plain.primeMock).not.toHaveBeenCalled();
    expect(plain.s.inspect().priming).toBeUndefined();

    // Production and development buildOnce alone never warm.
    const production = setup();
    await production.s.buildOnce();
    await production.s.buildOnce({ mode: 'development' });
    const second = await production.s.watch(new Events(), () => {});
    await second.initial;
    await until(() => production.primeMock.mock.calls.length === 1);
    await second.dispose();
    await production.s.buildOnce();
    await production.s.buildOnce({ mode: 'development' });
    expect(production.primeMock).toHaveBeenCalledTimes(1);

    // A production buildOnce is not a baseline.
    const onlyProduction = setup();
    await onlyProduction.s.buildOnce();
    const third = await onlyProduction.s.watch(new Events(), () => {});
    expect(await third.initial).toMatchObject({ generation: 2 });
    await third.dispose();
    expect(onlyProduction.primeMock).not.toHaveBeenCalled();

    // An input changed before subscription: the watch generates instead of reusing the baseline.
    const changed = setup();
    await changed.s.buildOnce({ mode: 'development' });
    writeFileSync(changed.page, 'raced body');
    const fourth = await changed.s.watch(new Events(), () => {});
    expect(await fourth.initial).toMatchObject({ generation: 2 });
    await fourth.dispose();
    expect(changed.primeMock).not.toHaveBeenCalled();

    // A failed buildOnce leaves no baseline.
    const failed = setup();
    failed.h.compile.mockImplementationOnce(async () => ({
      dependencies: [],
      diagnostics: [{ code: 'X', message: 'failed', severity: 'error', stage: 'content' }],
      whyRebuilt: [],
    }));
    expect((await failed.s.buildOnce({ mode: 'development' })).status).toBe('failure');
    const fifth = await failed.s.watch(new Events(), () => {});
    await fifth.initial;
    await fifth.dispose();
    expect(failed.primeMock).not.toHaveBeenCalled();

    // A compiler without the hook (in-process compilers, the reference path) is left alone.
    const without = setup();
    delete (without.h.services.compiler as { prime?: Prime }).prime;
    await without.s.buildOnce({ mode: 'development' });
    const sixth = await without.s.watch(new Events(), () => {});
    await sixth.initial;
    await sixth.dispose();
    expect(without.s.inspect().priming).toBeUndefined();
  });

  it('does not warm when a rescan was asked during verification', async () => {
    const { s, primeMock, h } = setup();
    await s.buildOnce({ mode: 'development' });
    const source = new Events();
    const gate = deferred<void>();
    source.gate = gate.promise;
    const watch = await s.watch(source, () => {});
    await until(() => source.subscribed === 1);
    // Events may have been missed: the baseline cannot be reused, and the watch generates.
    await s.rescan();
    gate.resolve();
    expect(await watch.initial).toMatchObject({ status: 'success', generation: 2 });
    expect(h.compile).toHaveBeenCalledTimes(2);
    expect(h.compile.mock.calls[1][0]).toMatchObject({
      changes: [],
      contentRequest: { origin: 'reconcile' },
    });
    expect(primeMock).not.toHaveBeenCalled();
    await watch.dispose();
  });

  it.each([
    ['a candidate for another revision', { status: 'primed', revision: 'other' }, 'stale'],
    ['a skipped warm-up', { status: 'skipped', reason: 'priming disabled' }, 'skipped'],
    ['a failed warm-up', { status: 'failed', code: 'X', message: 'x' }, 'failed'],
    ['an unknown outcome', { status: 'unknown' }, 'failed'],
    ['no outcome', undefined, 'failed'],
  ])('records %s without reporting anything', async (_name, outcome, state) => {
    const onDiagnostic = vi.fn();
    const { s, h } = setup(async () => outcome, { onDiagnostic });
    await s.buildOnce({ mode: 'development' });
    const events: BuildEvent[] = [];
    const watch = await s.watch(new Events(), (event) => events.push(event));
    await watch.initial;
    await until(() => s.inspect().priming === state);
    expect(events).toEqual([]);
    expect(onDiagnostic).not.toHaveBeenCalled();
    expect(h.commit).toHaveBeenCalledTimes(1);
    await watch.dispose();
  });

  it('contains a hook that rejects or throws synchronously', async () => {
    const rejecting = setup(async () => {
      throw new Error('rejected');
    });
    await rejecting.s.buildOnce({ mode: 'development' });
    const first = await rejecting.s.watch(new Events(), () => {});
    await first.initial;
    await until(() => rejecting.s.inspect().priming === 'failed');
    await first.dispose();

    const throwing = setup();
    (throwing.h.services.compiler as { prime?: Prime }).prime = () => {
      throw new Error('thrown');
    };
    await throwing.s.buildOnce({ mode: 'development' });
    const second = await throwing.s.watch(new Events(), () => {});
    expect((await second.initial).status).toBe('success');
    expect(throwing.s.inspect().priming).toBe('failed');
    await second.dispose();
  });
});
