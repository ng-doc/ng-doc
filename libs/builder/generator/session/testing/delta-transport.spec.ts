/** @vitest-environment node */

import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  ArtifactSnapshot,
  BuildEvent,
  BuildResult,
  CommitRequest,
  CommitResult,
  CompilationAcknowledgement,
  CompilationContext,
  CompilationRequest,
  CompilationResult,
  Diagnostic,
} from '../../contracts';
import { type SessionOptions, createBuildSession, GeneratorBuildSession } from '../build-session';
import { committed, compilation, Events, harness, until } from './support';

/**
 * With a compiler that acknowledges commits (a long-lived worker with the delta transport), a
 * watch generation passes the committed snapshot itself, adopts the returned candidate without
 * copies (it shares the unchanged artifacts with that snapshot), freezes it, shares the frozen
 * snapshot with consumers, and reports every candidate's commit outcome before the next compile.
 * buildOnce, production and compilers without the hook keep the copies.
 */
type Compile = (
  request: CompilationRequest,
  signal: AbortSignal,
  context?: CompilationContext,
) => Promise<CompilationResult>;
type Commit = (request: CommitRequest) => Promise<CommitResult>;

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const snapshotOf = (s: GeneratorBuildSession) =>
  (s as unknown as { snapshot?: ArtifactSnapshot }).snapshot;

describe('delta transport', () => {
  const sessions: GeneratorBuildSession[] = [];
  const roots: string[] = [];
  afterEach(async () => {
    await Promise.allSettled(sessions.splice(0).map((item) => item.dispose()));
    roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }));
  });

  function setup(options: SessionOptions = {}, acknowledging: boolean = true) {
    const h = harness();
    const acknowledgements: CompilationAcknowledgement[] = [];
    const acknowledge = vi.fn((acknowledgement: CompilationAcknowledgement) => {
      acknowledgements.push(acknowledgement);
    });
    if (acknowledging) h.services.compiler.acknowledge = acknowledge;
    const requests: CompilationRequest[] = [];
    const contexts: Array<CompilationContext | undefined> = [];
    const returned: CompilationResult[] = [];
    let next: Compile | undefined;
    h.compile.mockImplementation((async (request, signal, context) => {
      requests.push(request);
      contexts.push(context);
      const result = next
        ? await next(request, signal, context)
        : compilation(`r${request.generation}`);
      returned.push(result);
      return result;
    }) as Compile as never);
    let commit: Commit | undefined;
    h.commit.mockImplementation((async (request: CommitRequest) =>
      commit ? commit(request) : committed(request)) as never);
    const s = createBuildSession(h.services, { batchDelayMs: 0, ...options });
    sessions.push(s);
    return {
      h,
      s,
      acknowledge,
      acknowledgements,
      requests,
      contexts,
      returned,
      compileWith: (value?: Compile) => (next = value),
      commitWith: (value?: Commit) => (commit = value),
    };
  }

  const sources = new Map<GeneratorBuildSession, Events>();
  async function watching(s: GeneratorBuildSession) {
    const source = new Events();
    sources.set(s, source);
    const events: BuildEvent[] = [];
    const results: BuildResult[] = [];
    const watch = await s.watch(source, (event) => {
      events.push(event);
      if (event.kind === 'result') results.push(event.result);
    });
    const initial = await watch.initial;
    const edit = async (path: string) => {
      const before = results.length;
      source.emit({ kind: 'update', path });
      await until(() => results.length > before);
      return results[results.length - 1];
    };
    return { watch, initial, events, results, edit };
  }

  it('passes the committed snapshot as is and adopts the candidate without copies; consumers share it frozen', async () => {
    const { s, requests, contexts, returned, acknowledgements } = setup();
    const { initial, results, edit, watch } = await watching(s);
    expect(contexts[0]).toEqual({ lifetime: 'watch', delta: true });
    expect(requests[0].previous).toBeUndefined();
    // The candidate is the session's snapshot, frozen, and shared with every consumer.
    const candidate = returned[0].candidate!;
    expect(snapshotOf(s)).toBe(candidate);
    expect(Object.isFrozen(candidate)).toBe(true);
    expect(initial.status === 'success' && initial.snapshot).toBe(candidate);
    expect(results[0].status === 'success' && results[0].snapshot).toBe(candidate);
    // Everything else is still each consumer's own copy.
    expect(initial.status === 'success' && results[0].status === 'success').toBe(true);
    if (initial.status === 'success' && results[0].status === 'success') {
      expect(initial.manifest).toEqual(results[0].manifest);
      expect(initial.manifest).not.toBe(results[0].manifest);
      expect(() => {
        (initial.snapshot as { revision: string }).revision = 'changed';
      }).toThrow(TypeError);
    }
    const second = await edit('/docs/page.md');
    // The next generation's previous snapshot is the adopted candidate itself.
    expect(requests[1].previous).toBe(candidate);
    expect(contexts[1]).toEqual({ lifetime: 'watch', delta: true });
    expect(second.status === 'success' && second.snapshot).toBe(returned[1].candidate);
    expect(acknowledgements).toEqual([
      { generation: 1, revision: 'r1', status: 'committed' },
      { generation: 2, revision: 'r2', status: 'committed' },
    ]);
    // A rescan's generation is a watch generation too.
    await s.rescan();
    await until(() => requests.length === 3 && !s.inspect().building);
    expect(contexts[2]).toEqual({ lifetime: 'watch', delta: true });
    expect(requests[2].previous).toBe(returned[1].candidate);
    await watch.dispose();
  });

  it('acknowledges failed and stale commits and failed candidates as discarded, and nothing without a candidate', async () => {
    const { s, requests, returned, acknowledgements, compileWith, commitWith } = setup();
    const { edit, watch } = await watching(s);
    const base = snapshotOf(s);
    const failedCommit: Diagnostic = {
      code: 'TEST_COMMIT',
      message: 'failed',
      severity: 'error',
      stage: 'commit',
    };
    commitWith(async () => ({ status: 'failed', diagnostics: [failedCommit] }));
    expect((await edit('/a.md')).status).toBe('failure');
    commitWith(async () => ({ status: 'stale', diagnostics: [] }));
    expect((await edit('/b.md')).status).toBe('cancelled');
    commitWith(undefined);
    compileWith(async (request) => ({
      ...compilation(`r${request.generation}`),
      diagnostics: [{ code: 'TEST_ERROR', message: 'error', severity: 'error', stage: 'content' }],
    }));
    expect((await edit('/c.md')).status).toBe('failure');
    compileWith(async () => ({ dependencies: [], diagnostics: [], whyRebuilt: [] }));
    expect((await edit('/d.md')).status).toBe('failure');
    compileWith(undefined);
    expect((await edit('/e.md')).status).toBe('success');
    // Nothing was committed in between: every request passed the same committed snapshot.
    expect(requests.slice(1).map((request) => request.previous)).toEqual(Array(5).fill(base));
    for (const request of requests.slice(1)) expect(request.previous).toBe(base);
    expect(acknowledgements).toEqual([
      { generation: 1, revision: 'r1', status: 'committed' },
      { generation: 2, revision: 'r2', status: 'discarded' },
      { generation: 3, revision: 'r3', status: 'discarded' },
      { generation: 4, revision: 'r4', status: 'discarded' },
      { generation: 6, revision: 'r6', status: 'committed' },
    ]);
    expect(snapshotOf(s)).toBe(returned.at(-1)!.candidate);
    await watch.dispose();
  });

  it.each([
    ['delta', true],
    ['full', false],
  ])(
    'adopts and acknowledges a candidate whose generation was superseded after it committed (%s)',
    async (_label, acknowledging) => {
      const { h, s, requests, returned, acknowledgements, commitWith } = setup({}, acknowledging);
      const { watch, results } = await watching(s);
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      commitWith(async (request) => {
        await gate;
        return committed(request);
      });
      const emit = (path: string) => sources.get(s)!.emit({ kind: 'update', path });
      emit('/slow.md');
      await until(() => h.commit.mock.calls.length === 2);
      // A second change supersedes the committing generation; its commit still completes, so
      // generation 2 is on disk and must become the session's state.
      emit('/fast.md');
      commitWith(undefined);
      release();
      await until(() =>
        results.some((result) => result.status === 'success' && result.generation === 3),
      );
      // Adopted, and reported to hosts as a committed generation.
      expect(results.find((result) => result.generation === 2)).toMatchObject({
        status: 'success',
        superseded: true,
        manifest: { generation: 2, revision: 'r2' },
      });
      // Generation 3 compiled and committed against generation 2.
      expect(requests[2].previous?.revision).toBe('r2');
      if (acknowledging) expect(requests[2].previous).toBe(returned[1].candidate);
      expect(h.commit.mock.calls[2][0].previous).toMatchObject({ generation: 2, revision: 'r2' });
      expect(acknowledgements.slice(1)).toEqual(
        acknowledging
          ? [
              { generation: 2, revision: 'r2', status: 'committed' },
              { generation: 3, revision: 'r3', status: 'committed' },
            ]
          : [],
      );
      await watch.dispose();
    },
  );

  it('reports a failing acknowledgement hook and carries on', async () => {
    const reported: Diagnostic[] = [];
    const { s, acknowledge } = setup({ onDiagnostic: (item) => reported.push(item) });
    acknowledge.mockImplementation(() => {
      throw new Error('hook failed');
    });
    const { initial, edit, watch } = await watching(s);
    expect(initial.status).toBe('success');
    expect((await edit('/docs/page.md')).status).toBe('success');
    expect(reported.map((item) => item.code)).toEqual([
      'SESSION_COMPILER_ACKNOWLEDGE',
      'SESSION_COMPILER_ACKNOWLEDGE',
    ]);
    await watch.dispose();
  });

  it('keeps copies for buildOnce, production and compilers without the hook', async () => {
    const { s, requests, contexts, returned, acknowledgements } = setup();
    const once = await s.buildOnce({ mode: 'development' });
    const production = await s.buildOnce();
    expect(contexts.slice(0, 2)).toEqual([{ lifetime: 'generation' }, { lifetime: 'generation' }]);
    expect(requests[1].previous).toEqual(returned[0].candidate);
    expect(requests[1].previous).not.toBe(returned[0].candidate);
    expect(snapshotOf(s)).not.toBe(returned[1].candidate);
    for (const result of [once, production])
      expect(result.status === 'success' && Object.isFrozen(result.snapshot)).toBe(false);
    expect(acknowledgements).toEqual([]);
    // Without the hook, a watch generation keeps copying.
    const plain = setup({}, false);
    const { initial, edit, watch } = await watching(plain.s);
    expect(plain.contexts[0]).toEqual({ lifetime: 'watch' });
    await edit('/docs/page.md');
    expect(plain.requests[1].previous).not.toBe(plain.returned[0].candidate);
    expect(initial.status === 'success' && Object.isFrozen(initial.snapshot)).toBe(false);
    await watch.dispose();
  });

  it('primes with the frozen committed snapshot itself, which the first edit passes again', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ngdoc-delta-session-'));
    roots.push(root);
    mkdirSync(join(root, 'docs'), { recursive: true });
    const page = join(root, 'docs/page.md');
    writeFileSync(page, 'body');
    const { s, requests, compileWith, acknowledgements } = setup();
    compileWith(async (request) => {
      const text = readFileSync(page, 'utf8');
      return {
        ...compilation(`r${request.generation}`),
        dependencies: [{ kind: 'content', path: page, digest: digest(text) }],
      };
    });
    const primed: CompilationRequest[] = [];
    const compiler = (s as unknown as { services: { compiler: Record<string, unknown> } }).services
      .compiler;
    compiler['prime'] = vi.fn(async (request: CompilationRequest) => {
      primed.push(request);
      return { status: 'primed', revision: request.previous?.revision };
    });
    await s.buildOnce({ mode: 'development' });
    const { edit, watch } = await watching(s);
    await until(() => s.inspect().priming === 'primed');
    const committedSnapshot = snapshotOf(s);
    expect(primed[0].previous).toBe(committedSnapshot);
    expect(Object.isFrozen(committedSnapshot)).toBe(true);
    writeFileSync(page, 'edited');
    await edit(page);
    expect(requests[1].previous).toBe(committedSnapshot);
    expect(acknowledgements).toEqual([{ generation: 2, revision: 'r2', status: 'committed' }]);
    await watch.dispose();
  });
});
