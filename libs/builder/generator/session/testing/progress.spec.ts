/** @vitest-environment node */

import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import type {
  ArtifactSnapshot,
  BuildEvent,
  BuildResult,
  CommitRequest,
  CompilationContext,
  CompilationRequest,
  CompilationResult,
  Diagnostic,
  PageArtifact,
} from '../../contracts';
import type {
  ProgressEvent,
  ProgressSettledEvent,
  ProgressUpdateEvent,
} from '../../progress/events';
import { SESSION_PROGRESS_FAILED } from '../../progress/events';
import { type SessionOptions, createBuildSession, GeneratorBuildSession } from '../build-session';
import { SessionProgress } from '../progress';
import { committed, deferred, Events, harness, until } from './support';

const digest = (value: string) => createHash('sha256').update(value).digest('hex');

function page(id: string, route: string | undefined, outputs: number = 2): PageArtifact {
  return {
    id,
    identity: { projectId: 'test', entryId: id, role: 'page-shell' },
    outputs: Array.from({ length: outputs }, (_, index) => ({ path: `${id}/${index}.ts` })),
    diagnostics: [],
    content:
      route === undefined
        ? []
        : [{ ir: { absoluteRoute: `${route}/api` } }, { ir: { absoluteRoute: route } }],
  } as unknown as PageArtifact;
}

const aggregate = {
  id: 'aggregate',
  identity: { projectId: 'test', entryId: 'test', role: 'aggregate' },
  outputs: [{ path: 'index.ts' }],
  content: [],
  diagnostics: [],
} as unknown as PageArtifact;

function site(revision: string, pages: PageArtifact[]): ArtifactSnapshot {
  return {
    projectId: 'test',
    revision,
    artifacts: [...pages, aggregate],
    globalKeywords: [],
    remoteKeywords: [],
  };
}

const PAGES = [
  page('a', 'docs/a'),
  page('b', '/docs/b'),
  page('c', 'docs/c'),
  page('d', 'docs/d'),
  page('e', undefined),
];

const settledOf = (events: ProgressEvent[]) =>
  events.filter((event): event is ProgressSettledEvent => event.kind === 'progress-settled');

const ofGeneration = (events: ProgressEvent[], generation: number) =>
  events.filter((event) => 'generation' in event && event.generation === generation);

/** One start, strictly increasing `seq`, exactly one settle, nothing after it. */
function expectOrdered(events: ProgressEvent[], generation: number): void {
  const own = ofGeneration(events, generation);
  expect(own[0]).toMatchObject({ kind: 'progress-started', seq: 0, elapsedMs: 0 });
  expect(own.filter((event) => event.kind === 'progress-started')).toHaveLength(1);
  expect(own.filter((event) => event.kind === 'progress-settled')).toHaveLength(1);
  expect(own.at(-1)?.kind).toBe('progress-settled');
  const seqs = own.map((event) => (event as { seq: number }).seq);
  seqs.slice(1).forEach((seq, index) => expect(seq).toBeGreaterThan(seqs[index]));
  const elapsed = own.map((event) => (event as { elapsedMs: number }).elapsedMs);
  elapsed.slice(1).forEach((ms, index) => expect(ms).toBeGreaterThanOrEqual(elapsed[index]));
}

describe('session progress events', () => {
  const sessions: GeneratorBuildSession[] = [];
  const roots: string[] = [];
  afterEach(async () => {
    await Promise.allSettled(sessions.splice(0).map((item) => item.dispose()));
    roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }));
  });

  function setup(options: SessionOptions = {}) {
    const events: ProgressEvent[] = [];
    const diagnostics: Diagnostic[] = [];
    const h = harness();
    h.compile.mockImplementation((async (request: CompilationRequest) => ({
      candidate: site(`r${request.generation}`, PAGES),
      dependencies: [],
      diagnostics: [],
      whyRebuilt: request.previous
        ? [
            { ownerId: 'c', reason: 'input', detail: '' },
            { ownerId: 'aggregate', reason: 'membership', detail: '' },
            { ownerId: 'c', reason: 'semantic', detail: '' },
            { ownerId: 'e', reason: 'input', detail: '' },
            { ownerId: 'b', reason: 'input', detail: '' },
            { ownerId: 'a', reason: 'input', detail: '' },
            { ownerId: 'd', reason: 'input', detail: '' },
          ]
        : PAGES.map((item) => ({ ownerId: item.id, reason: 'initial' as const, detail: '' })),
    })) as never);
    h.commit.mockImplementation((async (request: CommitRequest) => {
      const result = committed(request);
      if (result.status !== 'committed') throw new Error('unreachable');
      result.manifest.files = request.candidate.artifacts.flatMap((artifact) =>
        artifact.outputs.map((output) => ({
          path: output.path,
          ownerId: artifact.id,
          digest: '',
          role: 'content' as const,
        })),
      );
      result.written = request.base ? ['c/0.ts'] : result.manifest.files.map((file) => file.path);
      result.removed = request.base ? ['old.ts'] : [];
      return result;
    }) as never);
    const s = createBuildSession(h.services, {
      batchDelayMs: 0,
      onProgress: (event) => void events.push(event),
      onDiagnostic: (diagnostic) => void diagnostics.push(diagnostic),
      ...options,
    });
    sessions.push(s);
    return { h, s, events, diagnostics };
  }

  it('reports a buildOnce from start to settle, with the full commit and its counts', async () => {
    const { s, events } = setup();
    const result = await s.buildOnce();
    expect(result.status).toBe('success');
    expectOrdered(events, 1);
    expect(events.map((event) => [event.kind, (event as ProgressUpdateEvent).state])).toEqual([
      ['progress-started', undefined],
      ['progress', 'start'],
      ['progress', 'end'],
      ['progress-settled', undefined],
    ]);
    expect(events[0]).toEqual({
      kind: 'progress-started',
      generation: 1,
      seq: 0,
      trigger: 'build',
      mode: 'production',
      changes: 0,
      elapsedMs: 0,
    });
    // Eleven outputs: five pages of two and the aggregate.
    expect(events[1]).toMatchObject({ phase: 'commit', state: 'start', completed: 0, total: 11 });
    const [settled] = settledOf(events);
    expect(settled).toMatchObject({
      status: 'success',
      counts: {
        pages: 5,
        rebuilt: 5,
        errors: 0,
        warnings: 0,
        written: 11,
        removed: 0,
        unchanged: 0,
      },
    });
    expect(settled.counts.routes).toBeUndefined();
    expect(Object.keys(settled.phases)).toEqual(['commit']);
    expect(settled.phases.commit).toBeGreaterThanOrEqual(0);
  });

  it('gives watch edits their routes and a delta commit without a total', async () => {
    const { s, events } = setup();
    await s.buildOnce({ mode: 'development' });
    const source = new Events();
    const results: BuildEvent[] = [];
    const watch = await s.watch(source, (event) => results.push(event));
    await watch.initial;
    const edit = events.length;
    source.emit({ kind: 'update', path: '/docs/c.md' });
    await until(() => settledOf(events).length === 3);
    const generation = settledOf(events)[2].generation;
    expectOrdered(events, generation);
    const own = ofGeneration(events.slice(edit), generation);
    expect(own[0]).toMatchObject({ trigger: 'watch', mode: 'development', changes: 1 });
    expect(own.find((event) => event.kind === 'progress')).toEqual(
      expect.not.objectContaining({ total: expect.anything() }),
    );
    // Unique pages in the compiler's order; the aggregate is not a page; `e` has no route.
    expect(settledOf(events)[2].counts).toEqual({
      pages: 5,
      rebuilt: 5,
      errors: 0,
      warnings: 0,
      written: 1,
      removed: 1,
      unchanged: 10,
      routes: ['/docs/c', '/docs/b', '/docs/a'],
    });
    await watch.dispose();
  });

  it('reports a rescan as its own trigger', async () => {
    const { s, events } = setup();
    const watch = await s.watch(new Events(), () => {});
    await watch.initial;
    await s.rescan();
    await until(() => settledOf(events).length === 2);
    expect(ofGeneration(events, 2)[0]).toMatchObject({ trigger: 'rescan', changes: 0 });
    await watch.dispose();
  });

  it('settles failures once, with their error count, and never commits', async () => {
    const { h, s, events } = setup();
    await s.buildOnce();
    h.compile.mockResolvedValueOnce({
      dependencies: [],
      diagnostics: [
        { code: 'E', severity: 'error', stage: 'content', message: 'e' },
        { code: 'W', severity: 'warning', stage: 'content', message: 'w' },
        { code: 'I', severity: 'info', stage: 'content', message: 'i' },
      ],
      whyRebuilt: [],
    } as CompilationResult);
    expect((await s.buildOnce()).status).toBe('failure');
    expectOrdered(events, 2);
    expect(ofGeneration(events, 2).map((event) => event.kind)).toEqual([
      'progress-started',
      'progress-settled',
    ]);
    // The last committed snapshot still has five pages.
    expect(settledOf(events)[1]).toMatchObject({
      status: 'failure',
      counts: { pages: 5, rebuilt: 0, errors: 1, warnings: 1 },
    });
  });

  it('settles a generation superseded before its commit as cancelled, with no updates after it', async () => {
    const { h, s, events } = setup();
    await s.buildOnce({ mode: 'development' });
    const source = new Events();
    const watch = await s.watch(source, () => {});
    await watch.initial;
    const gate = deferred<void>();
    const first = h.compile.getMockImplementation()!;
    h.compile.mockImplementationOnce((async (request: CompilationRequest, signal: AbortSignal) => {
      await gate.promise;
      expect(signal.aborted).toBe(true);
      return first(request, signal);
    }) as never);
    source.emit({ kind: 'update', path: '/docs/a.md' });
    // Generation 1 is the buildOnce, 2 the watch's first generation, 3 the edit.
    await until(() => h.compile.mock.calls.length === 3);
    source.emit({ kind: 'update', path: '/docs/b.md' });
    gate.resolve();
    await until(() => settledOf(events).length === 4);
    const cancelled = settledOf(events).find((event) => event.generation === 3)!;
    expect(cancelled.status).toBe('cancelled');
    expect(ofGeneration(events, 3).map((event) => event.kind)).toEqual([
      'progress-started',
      'progress-settled',
    ]);
    expectOrdered(events, 4);
    expect(settledOf(events).at(-1)).toMatchObject({ generation: 4, status: 'success' });
    await watch.dispose();
  });

  it('reports a generation superseded after its commit as superseded, with its files', async () => {
    const { h, s, events } = setup();
    await s.buildOnce({ mode: 'development' });
    const source = new Events();
    const watch = await s.watch(source, () => {});
    await watch.initial;
    const gate = deferred<void>();
    const commit = h.commit.getMockImplementation()!;
    h.commit.mockImplementationOnce((async (request: CommitRequest, guard, signal) => {
      await gate.promise;
      return commit(request, { isCurrent: () => true }, signal);
    }) as never);
    source.emit({ kind: 'update', path: '/docs/a.md' });
    await until(() => h.commit.mock.calls.length === 3);
    source.emit({ kind: 'update', path: '/docs/b.md' });
    gate.resolve();
    await until(() => settledOf(events).length === 4);
    const superseded = settledOf(events).find((event) => event.generation === 3)!;
    expect(superseded).toMatchObject({ status: 'superseded', counts: { written: 1, removed: 1 } });
    // The commit end is not shown: the generation was no longer current.
    expect(
      ofGeneration(events, 3).filter((event) => event.kind === 'progress' && event.state === 'end'),
    ).toEqual([]);
    expect(superseded.phases.commit).toBeGreaterThanOrEqual(0);
    await watch.dispose();
  });

  it('keeps results identical with and without a consumer, a failing one included', async () => {
    /** A buildOnce, then a watch edit superseded after its commit by a second edit. */
    async function run(options: SessionOptions): Promise<string[]> {
      const { h, s } = setup(options);
      const results: BuildResult[] = [await s.buildOnce({ mode: 'development' })];
      const source = new Events();
      const watch = await s.watch(source, (event) => {
        if (event.kind === 'result') results.push(event.result);
      });
      await watch.initial;
      const gate = deferred<void>();
      const commit = h.commit.getMockImplementation()!;
      h.commit.mockImplementationOnce((async (request: CommitRequest, _guard, signal) => {
        await gate.promise;
        return commit(request, { isCurrent: () => true }, signal);
      }) as never);
      source.emit({ kind: 'update', path: '/docs/a.md' });
      await until(() => h.commit.mock.calls.length === 3);
      source.emit({ kind: 'update', path: '/docs/b.md' });
      gate.resolve();
      await until(() => results.length === 4);
      await watch.dispose();
      return results.map((result) => JSON.stringify(result));
    }
    const plain = await run({ onProgress: undefined });
    const observed: ProgressEvent[] = [];
    const recorded = await run({ onProgress: (event) => void observed.push(event) });
    const failures: Diagnostic[] = [];
    const throwing = await run({
      onProgress: () => {
        throw new Error('consumer broke');
      },
      onDiagnostic: (diagnostic) => void failures.push(diagnostic),
    });
    expect(plain.map((result) => JSON.parse(result).status)).toEqual([
      'success',
      'success',
      'success',
      'success',
    ]);
    expect(JSON.parse(plain[2]).superseded).toBe(true);
    expect(recorded).toEqual(plain);
    expect(throwing).toEqual(plain);
    expect(settledOf(observed).map((event) => event.status)).toEqual([
      'success',
      'success',
      'superseded',
      'success',
    ]);
    expect(failures.map((diagnostic) => diagnostic.code)).toEqual([SESSION_PROGRESS_FAILED]);
  });

  it("forwards the compilation's phases through a non-enumerable context sink", async () => {
    const { h, s, events } = setup();
    const implementation = h.compile.getMockImplementation()!;
    let seen: CompilationContext | undefined;
    h.compile.mockImplementationOnce((async (
      request: CompilationRequest,
      signal: AbortSignal,
      context: CompilationContext,
    ) => {
      seen = context;
      const sink = context.progress!;
      sink({ phase: 'boot', state: 'start' });
      sink({ phase: 'boot', state: 'end' });
      sink({ phase: 'discovery', state: 'start', pass: 'targeted' });
      sink({ phase: 'semantic', state: 'start', pass: 'targeted' });
      sink({ phase: 'render', state: 'start', completed: 0, total: 5, pass: 'targeted' });
      sink({ phase: 'render', state: 'advance', completed: 2, reused: 1, pass: 'targeted' });
      // The fall back restarts the phases at `describe`: the analysis before it keeps its time,
      // and the phases from it on are timed for the full pass only.
      sink({ phase: 'describe', state: 'start', pass: 'full', reason: 'configuration changed' });
      sink({ phase: 'link', state: 'start', completed: 0, total: 5, pass: 'full' });
      sink({ phase: 'persist', state: 'start', pass: 'full' });
      sink({ phase: 'persist', state: 'end', pass: 'full' });
      sink({ phase: 'transfer', state: 'start' });
      sink({ phase: 'transfer', state: 'end' });
      return implementation(request, signal, context);
    }) as never);
    const result = await s.buildOnce();
    expect(result.status).toBe('success');
    expect(Object.keys(seen!)).toEqual(['lifetime']);
    expectOrdered(events, 1);
    const updates = events.filter(
      (event): event is ProgressUpdateEvent => event.kind === 'progress',
    );
    expect(updates.map((event) => `${event.phase}:${event.state}`)).toEqual([
      'boot:start',
      'boot:end',
      'discovery:start',
      'semantic:start',
      'render:start',
      'render:advance',
      'describe:start',
      'link:start',
      'persist:start',
      'persist:end',
      'transfer:start',
      'transfer:end',
      'commit:start',
      'commit:end',
    ]);
    expect(updates[5]).toMatchObject({ completed: 2, reused: 1, pass: 'targeted' });
    expect(updates[6]).toMatchObject({ pass: 'full', reason: 'configuration changed' });
    const [settled] = settledOf(events);
    expect(settled).toMatchObject({ pass: 'full', reason: 'configuration changed' });
    expect(Object.keys(settled.phases).sort()).toEqual(
      ['boot', 'commit', 'describe', 'discovery', 'link', 'persist', 'semantic', 'transfer'].sort(),
    );
    // Late updates (after the settle) are dropped.
    seen!.progress!({ phase: 'render', state: 'start' });
    expect(settledOf(events)).toHaveLength(1);
    expect(events.at(-1)?.kind).toBe('progress-settled');
  });

  it('gives the compiler no sink without a consumer', async () => {
    const { h, s } = setup({ onProgress: undefined });
    await s.buildOnce();
    const context = h.compile.mock.calls[0][2] as CompilationContext;
    expect(context).toEqual({ lifetime: 'generation' });
    expect(context.progress).toBeUndefined();
  });

  it('reports a failing consumer once as a warning and keeps building', async () => {
    const thrown: ProgressEvent[] = [];
    const { s, diagnostics } = setup({
      onProgress: (event) => {
        thrown.push(event);
        throw new Error('sink broke');
      },
    });
    expect((await s.buildOnce()).status).toBe('success');
    expect((await s.buildOnce()).status).toBe('success');
    expect(thrown.length).toBeGreaterThan(4);
    expect(diagnostics).toEqual([
      expect.objectContaining({ code: SESSION_PROGRESS_FAILED, severity: 'warning' }),
    ]);
  });

  it('reports a result the session could not copy as a failure', async () => {
    const { h, s, events } = setup();
    const commit = h.commit.getMockImplementation()!;
    h.commit.mockImplementationOnce((async (...args: Parameters<typeof commit>) => {
      const result = await commit(...args);
      result.diagnostics.push({
        code: 'W',
        severity: 'warning',
        stage: 'commit',
        message: 'w',
        uncloneable: () => undefined,
      } as unknown as Diagnostic);
      return result;
    }) as never);
    const result = await s.buildOnce();
    expect(result.status).toBe('failure');
    expect(result.diagnostics[0].code).toBe('SESSION_INVALID_RESULT');
    expect(settledOf(events)).toEqual([
      expect.objectContaining({
        status: 'failure',
        counts: expect.objectContaining({ errors: 1 }),
      }),
    ]);
  });

  describe('work outside a generation', () => {
    function withBaseline(prime: (signal: AbortSignal) => Promise<unknown>) {
      const root = mkdtempSync(join(tmpdir(), 'ngdoc-progress-'));
      roots.push(root);
      mkdirSync(join(root, 'docs'), { recursive: true });
      const file = join(root, 'docs/page.md');
      writeFileSync(file, 'body');
      const context = setup();
      context.h.compile.mockImplementation((async (request: CompilationRequest) => {
        const body = readFileSync(file, 'utf8');
        return {
          candidate: site(`${request.generation}:${body}`, PAGES),
          dependencies: [{ kind: 'content', path: file, digest: digest(body) }],
          diagnostics: [],
          whyRebuilt: [],
        };
      }) as never);
      const compiler = context.h.services.compiler as typeof context.h.services.compiler & {
        prime?: (request: CompilationRequest, signal: AbortSignal) => Promise<unknown>;
      };
      compiler.prime = (_request, signal) => prime(signal);
      return { ...context, file };
    }

    const activities = (events: ProgressEvent[]) =>
      events
        .filter((event) => event.kind === 'progress-activity')
        .map((event) => [
          (event as { activity: string }).activity,
          (event as { state: string }).state,
          (event as { failed?: boolean }).failed ? 'failed' : '',
          (event as { stopped?: boolean }).stopped ? 'stopped' : '',
        ]);

    it('reports the input check and the warm-up around a reused baseline', async () => {
      const { s, events } = withBaseline(async () => ({ status: 'primed', revision: '1:body' }));
      await s.buildOnce({ mode: 'development' });
      const watch = await s.watch(new Events(), () => {});
      await watch.initial;
      await until(() => s.inspect().priming === 'primed');
      expect(activities(events)).toEqual([
        ['checking-inputs', 'start', '', ''],
        ['checking-inputs', 'end', '', ''],
        ['warming-up', 'start', '', ''],
        ['warming-up', 'end', '', ''],
      ]);
      await watch.dispose();
    });

    it('reports a failed warm-up as failed', async () => {
      const { s, events } = withBaseline(async () => {
        throw new Error('runtime lost');
      });
      await s.buildOnce({ mode: 'development' });
      const watch = await s.watch(new Events(), () => {});
      await watch.initial;
      await until(() => s.inspect().priming === 'failed');
      expect(activities(events).at(-1)).toEqual(['warming-up', 'end', 'failed', '']);
      await watch.dispose();
    });

    it('ends a warm-up that an edit stops before the edit starts', async () => {
      const running = deferred<unknown>();
      const { s, events, file } = withBaseline((signal) => {
        signal.addEventListener('abort', () => running.resolve({ status: 'aborted' }));
        return running.promise;
      });
      await s.buildOnce({ mode: 'development' });
      const source = new Events();
      const watch = await s.watch(source, () => {});
      await watch.initial;
      await until(() => s.inspect().priming === 'running');
      writeFileSync(file, 'edited');
      source.emit({ kind: 'update', path: file });
      await until(() => settledOf(events).length === 2);
      const end = events.findIndex(
        (event) =>
          event.kind === 'progress-activity' &&
          event.activity === 'warming-up' &&
          event.state === 'end',
      );
      const started = events.findIndex(
        (event) => event.kind === 'progress-started' && event.generation === 2,
      );
      expect(end).toBeGreaterThan(-1);
      expect(end).toBeLessThan(started);
      // The aborted warm-up settles later without a second end.
      await running.promise;
      await new Promise((done) => setTimeout(done, 5));
      expect(activities(events).filter(([name]) => name === 'warming-up')).toEqual([
        ['warming-up', 'start', '', ''],
        ['warming-up', 'end', '', 'stopped'],
      ]);
      await watch.dispose();
    });
  });
});

describe('SessionProgress', () => {
  it('reports a result or a candidate it cannot read without counts or a total', () => {
    const events: ProgressEvent[] = [];
    const progress = new SessionProgress(
      (event) => void events.push(event),
      () => {},
    );
    const generation = progress.start(
      { generation: 1, trigger: 'build', mode: 'production', changes: 0 },
      () => true,
    )!;
    generation.commitStarted({ artifacts: [{}] } as unknown as ArtifactSnapshot);
    generation.settle({ status: 'failure', generation: 1 } as unknown as BuildResult);
    expect(events[1]).toMatchObject({ phase: 'commit', state: 'start' });
    expect(events[1]).not.toHaveProperty('total');
    expect(events.at(-1)).toMatchObject({
      status: 'failure',
      counts: { pages: 0, rebuilt: 0, errors: 0, warnings: 0 },
    });
  });

  it('does nothing without a consumer', () => {
    const progress = new SessionProgress(undefined, () => {});
    expect(
      progress.start(
        { generation: 1, trigger: 'build', mode: 'production', changes: 0 },
        () => true,
      ),
    ).toBeUndefined();
    expect(() => progress.activity('warming-up', 'start')).not.toThrow();
  });

  it('ignores an activity end without a start, and anything after a settle', () => {
    const events: ProgressEvent[] = [];
    let clock = 0;
    const progress = new SessionProgress(
      (event) => void events.push(event),
      () => {},
      () => clock,
    );
    progress.activity('checking-inputs', 'end');
    expect(events).toEqual([]);
    const generation = progress.start(
      { generation: 4, trigger: 'watch', mode: 'development', changes: 2 },
      () => true,
    )!;
    clock = 5;
    generation.commitStarted();
    clock = 9;
    // A delta commit has no total.
    expect(events[1]).not.toHaveProperty('total');
    // Settled while the commit phase is open: the phase is closed with the settle.
    generation.settle({
      status: 'cancelled',
      generation: 4,
      diagnostics: [],
      whyRebuilt: [],
    });
    generation.settle({ status: 'cancelled', generation: 4, diagnostics: [], whyRebuilt: [] });
    generation.commitStarted(3);
    expect(events.map((event) => event.kind)).toEqual([
      'progress-started',
      'progress',
      'progress-settled',
    ]);
    expect(events.at(-1)).toMatchObject({
      status: 'cancelled',
      elapsedMs: 9,
      phases: { commit: 4 },
      counts: { pages: 0, rebuilt: 0, errors: 0, warnings: 0 },
    });
  });
});
