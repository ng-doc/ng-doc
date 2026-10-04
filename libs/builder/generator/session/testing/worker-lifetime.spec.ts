/** @vitest-environment node */

import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  BuildEvent,
  CompilationContext,
  CompilationRequest,
  CompilationResult,
} from '../../contracts';
import { createBuildSession, GeneratorBuildSession } from '../build-session';
import { deferred, Events, harness, until } from './support';

/**
 * The session tells the compiler which generations may share a long-lived development runtime
 * (development generations of an active watch) and when that watch starts and stops. buildOnce
 * and production always ask for a one-shot runtime.
 */
type Delegate = (
  request: CompilationRequest,
  signal: AbortSignal,
  context?: CompilationContext,
) => Promise<CompilationResult>;

describe('compiler runtime lifetime', () => {
  const sessions: GeneratorBuildSession[] = [];
  afterEach(async () => {
    await Promise.allSettled(sessions.splice(0).map((item) => item.dispose()));
  });

  function setup() {
    const h = harness();
    const calls: string[] = [];
    const watching = vi.fn((active: boolean) => {
      calls.push(`watching:${active}`);
    });
    h.services.compiler.watching = watching;
    const contexts: Array<CompilationContext | undefined> = [];
    const base = h.compile.getMockImplementation()!;
    h.compile.mockImplementation(((
      request: CompilationRequest,
      signal: AbortSignal,
      context?: CompilationContext,
    ) => {
      contexts.push(context);
      calls.push(`compile:${request.generation}:${context?.lifetime}`);
      return base(request, signal);
    }) as unknown as Delegate);
    const s = createBuildSession(h.services, { batchDelayMs: 0 });
    sessions.push(s);
    return { h, s, calls, contexts, watching };
  }

  it('uses the watch lifetime only for development watch generations', async () => {
    const { s, calls } = setup();
    await s.buildOnce();
    await s.buildOnce({ mode: 'development' });
    const source = new Events();
    const events: BuildEvent[] = [];
    const watch = await s.watch(source, (event) => events.push(event));
    await watch.initial;
    source.emit({ kind: 'update', path: '/docs/page.md' });
    await until(() => calls.filter((call) => call.startsWith('compile')).length === 4);
    await s.rescan();
    await until(() => calls.filter((call) => call.startsWith('compile')).length === 5);
    // A buildOnce while watching still runs one-shot.
    await s.buildOnce();
    await watch.dispose();
    expect(calls).toEqual([
      'compile:1:generation',
      'compile:2:generation',
      'watching:true',
      'compile:3:watch',
      'compile:4:watch',
      'compile:5:watch',
      'compile:6:generation',
      'watching:false',
    ]);
  });

  it('ends the watch runtime only after the active watch generation settled, and contains hook failures', async () => {
    const { h, s, calls, watching } = setup();
    const release = deferred<void>();
    // setup() records each call (with its context) before delegating here.
    const record = h.compile.getMockImplementation() as unknown as Delegate;
    h.compile.mockImplementation(((
      request: CompilationRequest,
      signal: AbortSignal,
      context?: CompilationContext,
    ) => {
      const result = record(request, signal, context);
      return release.promise.then(() => result);
    }) as unknown as Delegate);
    const source = new Events();
    await s
      .watch(source, () => {})
      .then(async (watch) => {
        await until(() => calls.includes('compile:1:watch'));
        const stopping = watch.dispose();
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(calls).not.toContain('watching:false');
        release.resolve();
        await stopping;
        expect(calls.at(-1)).toBe('watching:false');
      });
    // A throwing or rejecting hook neither breaks readiness nor the stop.
    watching.mockImplementation(() => {
      throw new Error('hook failed');
    });
    const second = await s.watch(new Events(), () => {});
    expect((await second.initial).status).toBe('success');
    watching.mockImplementation(async () => {
      throw new Error('hook rejected');
    });
    await second.dispose();
  });
});
