import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ViteDevServer } from 'vite';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createOutputCommitter } from '../../artifacts';
import type {
  ArtifactSnapshot,
  BuildResult,
  CommitGuard,
  CommitRequest,
  CompilationRequest,
  CompilationResult,
  Diagnostic,
  FileChange,
  FileEventSource,
  OutputCommitter,
  OutputManifest,
} from '../../contracts';
import { bytesDigest } from '../../kernel/canonical';
import { createBuildSession } from '../../session/build-session';
import {
  type HostUpdateRecovery,
  type HostUpdateTicket,
  HOST_BURST_EVENTS,
  HOST_BURST_QUIET_MS,
  HOST_COMPLETION_TIMEOUT_MS,
  HostUpdateCoordinator,
} from '../host-updates';
import { acquireOutputLease } from '../lease';
import { ViteAdapterLifecycle } from '../lifecycle';

/**
 * Bursts of file events (thousands of files created and renamed while the dev server runs):
 * host update timeouts are reported once per burst with one summary, and the pass after the
 * burst publishes the newest edit, whether its hot update timed out and left its obligation open
 * or its generation failed under the load. The patterns are injected, so no real churn is needed.
 */

const roots: string[] = [];
afterEach(() => {
  vi.useRealTimers();
  roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }));
});

const sha = (value: string) => createHash('sha256').update(value).digest('hex');

/**
 *
 */
function directory(): string {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'ngdoc-bursts-')));
  roots.push(root);
  return root;
}

/**
 *
 * @param files
 * @param generation
 */
function manifest(files: Array<[string, string]>, generation: number = 1): OutputManifest {
  return {
    schemaVersion: 1,
    projectId: 'test',
    generation,
    revision: `r${generation}`,
    files: files.map(([file, digest]) => ({
      path: file,
      digest,
      role: file.endsWith('.ts') ? 'angular' : 'content',
      ownerId: 'aggregate:test',
    })),
  };
}

/**
 *
 * @param generation
 * @param files
 */
function success(
  generation: number,
  files: Array<[string, string]>,
): Extract<BuildResult, { status: 'success' }> {
  return {
    status: 'success',
    generation,
    snapshot: {
      projectId: 'test',
      revision: `r${generation}`,
      artifacts: [],
      globalKeywords: [],
      remoteKeywords: [],
    },
    manifest: manifest(files, generation),
    diagnostics: [],
    whyRebuilt: [],
  };
}

/**
 * Real I/O completes in the poll phase; immediates are not faked, so this lets it run.
 * @param check
 */
async function until(check: () => boolean): Promise<void> {
  for (let turn = 0; turn < 10_000 && !check(); turn++)
    await new Promise((resolve) => setImmediate(resolve));
  expect(check()).toBe(true);
}

interface Recorded extends HostUpdateRecovery {
  warnings: string[];
  replays: Array<[string, string]>;
  rescans: number;
}

/**
 *
 * @param onReplay
 */
function recorder(
  onReplay?: (file: string, type: 'create' | 'update' | 'delete') => void,
): Recorded {
  const recorded: Recorded = {
    warnings: [],
    replays: [],
    rescans: 0,
    warn: (message) => recorded.warnings.push(message),
    replay: (file, type) => {
      recorded.replays.push([path.basename(file), type]);
      onReplay?.(file, type);
    },
    rescan: () => {
      recorded.rescans += 1;
    },
  };
  return recorded;
}

/** Fakes only the clock the coordinator uses; file system callbacks and immediates stay real. */
function fakeClock(): void {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
}

describe('host update bursts', () => {
  it('replays the outputs of a hot update that timed out, so the edit reloads once after the burst', async () => {
    fakeClock();
    const root = directory();
    const routes = path.join(root, 'routes.ts');
    const page = path.join(root, 'page.ts');
    writeFileSync(routes, 'old');
    const notify = vi.fn();
    const fail = vi.fn();
    const pending: Array<Promise<unknown>> = [];
    // The host's replay is a watcher event: the plugin starts a hot update for it. A generated
    // TypeScript update takes a compiler pass; a created output is acknowledged by its hook.
    const report = (file: string, type: 'create' | 'update' | 'delete') => {
      const ticket = coordinator.begin(file, type, () => readFileSync(file, 'utf8'), false);
      pending.push(
        type === 'update'
          ? ticket.ready.then(async () => {
              await coordinator.acknowledge(ticket, false, true);
              await coordinator.settle(ticket);
            })
          : coordinator.complete(ticket),
      );
    };
    const recovery = recorder(report);
    const coordinator = new HostUpdateCoordinator(notify, fail, recovery);
    coordinator.seed(root, manifest([['routes.ts', sha('old')]]));

    // Generation 2 rewrites routes.ts and creates page.ts. Under the burst the watcher reports
    // the rewrite, but page.ts's creation never arrives.
    coordinator.started(2, [{ kind: 'update', path: path.join(root, '../docs/page.md') }]);
    writeFileSync(routes, 'new');
    writeFileSync(page, 'page');
    const value = success(2, [
      ['routes.ts', sha('new')],
      ['page.ts', sha('page')],
    ]);
    coordinator.result(value);
    coordinator.published(value, false);
    const update = coordinator.begin(routes, 'update', () => readFileSync(routes, 'utf8'), false);
    let rejected: unknown;
    void update.ready.catch((error: unknown) => {
      rejected = error;
    });
    // The update's pass must witness the created page.ts first, so it waits for that report.
    await until(() => vi.getTimerCount() > 0);
    await vi.advanceTimersByTimeAsync(HOST_COMPLETION_TIMEOUT_MS);
    await until(() => rejected !== undefined);
    expect(String(rejected)).toContain('[NGDOC_VITE_HOST_TIMEOUT]');
    expect(fail).toHaveBeenCalledOnce();
    // The hook threw, so Angular never acknowledged it: without the pass after the burst the
    // generation's obligations stay open, and no reload is ever sent.
    expect(notify).not.toHaveBeenCalled();
    expect(coordinator.blockerCount()).toBe(2);

    await vi.advanceTimersByTimeAsync(HOST_BURST_QUIET_MS);
    await until(() => recovery.rescans === 1);
    expect(recovery.replays).toEqual([
      ['page.ts', 'create'],
      ['routes.ts', 'update'],
    ]);
    await Promise.all(pending);
    expect(notify).toHaveBeenCalledOnce();
    expect(coordinator.blockerCount()).toBe(0);
    // One timeout: nothing was held back, so there is no summary.
    expect(recovery.warnings).toEqual([]);
    expect(fail).toHaveBeenCalledOnce();
    coordinator.dispose();
  });

  it('reports the first host update timeout of a burst and sums up the rest in one warning', async () => {
    fakeClock();
    const root = directory();
    const routes = path.join(root, 'routes.ts');
    writeFileSync(routes, 'old');
    const notify = vi.fn();
    const fail = vi.fn();
    const recovery = recorder();
    const coordinator = new HostUpdateCoordinator(notify, fail, recovery);
    coordinator.seed(root, manifest([['routes.ts', sha('old')]]));
    coordinator.started(2, []);
    writeFileSync(routes, 'new');
    const value = success(2, [['routes.ts', sha('new')]]);
    coordinator.result(value);
    coordinator.published(value, false);
    // routes.ts's report is lost: every hot update of the burst waits for its obligation.
    const settled: Array<Promise<unknown>> = [];
    for (let index = 0; index < 500; index++) {
      const file = path.join(root, `../churn/f${index}.txt`);
      const ticket = coordinator.begin(file, 'create', async () => '', false);
      settled.push(
        coordinator.complete(ticket).then(
          () => 'settled',
          (error: unknown) => error,
        ),
      );
    }
    await vi.advanceTimersByTimeAsync(HOST_COMPLETION_TIMEOUT_MS);
    const outcomes = await Promise.all(settled);
    expect(outcomes.every((outcome) => String(outcome).includes('[NGDOC_VITE_HOST_TIMEOUT]'))).toBe(
      true,
    );
    expect(fail).toHaveBeenCalledOnce();
    expect(recovery.warnings).toEqual([]);

    await vi.advanceTimersByTimeAsync(HOST_BURST_QUIET_MS);
    await until(() => recovery.rescans === 1);
    expect(recovery.warnings).toHaveLength(1);
    expect(recovery.warnings[0]).toMatch(
      /^\[NGDOC_VITE_HOST_TIMEOUT\] 499 more host update\(s\) did not settle within 30 s /,
    );
    expect(recovery.replays).toEqual([['routes.ts', 'update']]);

    // The next burst reports its first timeout again.
    const late = coordinator.begin(
      path.join(root, '../churn/late.txt'),
      'create',
      async () => '',
      false,
    );
    const outcome = coordinator.complete(late).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(HOST_COMPLETION_TIMEOUT_MS);
    expect(String(await outcome)).toContain('[NGDOC_VITE_HOST_TIMEOUT]');
    expect(fail).toHaveBeenCalledTimes(2);
    expect(notify).not.toHaveBeenCalled();
    coordinator.dispose();
  });

  it('takes one pass after a burst of hot updates, and none for fewer', async () => {
    fakeClock();
    const root = directory();
    const recovery = recorder();
    const coordinator = new HostUpdateCoordinator(vi.fn(), vi.fn(), recovery);
    coordinator.seed(root, manifest([]));
    const burst = async (count: number) => {
      for (let index = 0; index < count; index++) {
        const ticket = coordinator.begin(
          path.join(root, `../churn/f${index}.txt`),
          'create',
          async () => '',
          false,
        );
        await coordinator.complete(ticket);
      }
    };
    await burst(HOST_BURST_EVENTS - 1);
    await vi.advanceTimersByTimeAsync(HOST_BURST_QUIET_MS * 2);
    await new Promise((resolve) => setImmediate(resolve));
    expect(recovery.rescans).toBe(0);

    await burst(HOST_BURST_EVENTS);
    // The burst lasts while hot updates keep coming: a quiet period ends it, not its first timer.
    await vi.advanceTimersByTimeAsync(HOST_BURST_QUIET_MS - 1);
    await burst(10);
    await vi.advanceTimersByTimeAsync(HOST_BURST_QUIET_MS - 1);
    await new Promise((resolve) => setImmediate(resolve));
    expect(recovery.rescans).toBe(0);
    // A generation in flight: the inputs are re-observed after its result, not during it.
    coordinator.started(2, []);
    await vi.advanceTimersByTimeAsync(1);
    for (let turn = 0; turn < 50; turn++) await new Promise((resolve) => setImmediate(resolve));
    expect(recovery.rescans).toBe(0);
    coordinator.result(success(2, []));
    coordinator.published(success(2, []), false);
    await until(() => recovery.rescans === 1);
    expect(recovery.replays).toEqual([]);
    expect(recovery.warnings).toEqual([]);

    // Disposed during a burst: no pass.
    await burst(HOST_BURST_EVENTS);
    coordinator.dispose();
    await vi.advanceTimersByTimeAsync(HOST_BURST_QUIET_MS * 2);
    await new Promise((resolve) => setImmediate(resolve));
    expect(recovery.rescans).toBe(1);
  });

  it('counts no burst for the writes of NgDoc itself or before the first publication', async () => {
    fakeClock();
    const root = directory();
    const recovery = recorder();
    const coordinator = new HostUpdateCoordinator(vi.fn(), vi.fn(), recovery);
    // The first generation's writes, reported before the coordinator knows its output root.
    for (let index = 0; index < HOST_BURST_EVENTS; index++)
      coordinator.begin(path.join(root, `page${index}.ts`), 'create', async () => '', false);
    coordinator.seed(root, manifest([]));
    // A large commit's writes below the output root.
    for (let index = 0; index < HOST_BURST_EVENTS; index++)
      coordinator.begin(path.join(root, `next${index}.ts`), 'create', async () => '', false);
    await vi.advanceTimersByTimeAsync(HOST_BURST_QUIET_MS * 2);
    await new Promise((resolve) => setImmediate(resolve));
    expect(recovery.rescans).toBe(0);
    coordinator.dispose();
  });

  it('leaves an output a newer write replaced to that write, and tolerates a failing host', async () => {
    fakeClock();
    const root = directory();
    const data = path.join(root, 'page.content.mjs');
    writeFileSync(data, 'old');
    const failing: HostUpdateRecovery = {
      warn: () => {},
      replay: vi.fn(() => {
        throw new Error('no watcher');
      }),
      rescan: vi.fn(() => {
        throw new Error('no session');
      }),
    };
    const coordinator = new HostUpdateCoordinator(vi.fn(), vi.fn(), failing);
    coordinator.seed(root, manifest([['page.content.mjs', sha('old')]]));
    for (const [generation, body] of [
      [2, 'two'],
      [3, 'three'],
    ] as const) {
      coordinator.started(generation, []);
      writeFileSync(data, body);
      const value = success(generation, [['page.content.mjs', sha(body)]]);
      coordinator.result(value);
      coordinator.published(value, false);
    }
    // A timeout opens the burst; generation 2's expectation is stale (the file holds 3's bytes).
    const ticket = coordinator.begin(
      path.join(root, '../churn/a.txt'),
      'create',
      async () => '',
      false,
    );
    const outcome = coordinator.complete(ticket).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(HOST_COMPLETION_TIMEOUT_MS);
    expect(String(await outcome)).toContain('[NGDOC_VITE_HOST_TIMEOUT]');
    // Generation 3's write goes away before the pass: nothing is replayed.
    for (let turn = 0; turn < 50; turn++) await new Promise((resolve) => setImmediate(resolve));
    rmSync(data);
    await vi.advanceTimersByTimeAsync(HOST_BURST_QUIET_MS);
    await until(() => (failing.rescan as ReturnType<typeof vi.fn>).mock.calls.length === 1);
    expect(failing.replay).not.toHaveBeenCalled();
    coordinator.dispose();
  });
});

class Events implements FileEventSource {
  listener?: (events: FileChange[]) => unknown;
  async subscribe(
    listener: (events: FileChange[]) => unknown,
    _onError: (item: Diagnostic) => void,
  ) {
    this.listener = listener;
    return { dispose: async () => {} };
  }
  emit(...events: FileChange[]) {
    this.listener?.(events);
  }
}

it('publishes an edit whose generation failed under a burst of file events', async () => {
  const root = directory();
  const output = path.join(root, 'out');
  const docs = path.join(root, 'docs');
  mkdirSync(output);
  mkdirSync(docs);
  const source = path.join(docs, 'a.md');
  writeFileSync(source, 'one');
  const configuration = {
    outputRoot: output,
    cacheRoot: path.join(root, 'cache'),
    assetDirectory: 'assets',
    themes: { light: 'github-light', dark: 'ayu-dark' },
    digest: 'configuration',
  };
  const module = (body: string) => `export default ${JSON.stringify(body)};\n`;
  const snapshot = (body: string): ArtifactSnapshot => ({
    configuration,
    projectId: 'project',
    revision: body,
    artifacts: [
      {
        id: 'a',
        identity: { projectId: 'project', entryId: 'a', role: 'content' },
        revision: body,
        fingerprint: {
          schemaVersion: 4,
          compilerVersion: 'compiler',
          toolchainDigest: 'toolchain',
          configurationDigest: 'configuration',
          inputDigest: body,
          keywordDigest: 'keywords',
        },
        dependencies: [],
        content: [],
        exportedKeywords: [],
        usedKeywords: [],
        searchRecords: [],
        routes: [],
        apiList: [],
        outputs: [
          {
            path: 'pages/a.mjs',
            role: 'content',
            encoding: 'utf8',
            content: module(body),
            digest: sha(module(body)),
          },
        ],
        diagnostics: [],
      },
    ],
    globalKeywords: [],
    remoteKeywords: [],
  });
  const compiled: CompilationRequest[] = [];
  let starved = false;
  const compiler = {
    async compile(request: CompilationRequest): Promise<CompilationResult> {
      compiled.push(request);
      // Under the burst the compiler runtime missed its deadline: an infrastructure failure, not
      // an error in the page.
      if (starved) {
        starved = false;
        return {
          dependencies: [],
          diagnostics: [
            {
              code: 'WORKER_COMPILE_TIMEOUT',
              severity: 'error',
              stage: 'content',
              message: 'Compilation deadline exceeded',
            },
          ],
          whyRebuilt: [],
        };
      }
      const bytes = readFileSync(source);
      return {
        candidate: snapshot(bytes.toString('utf8')),
        dependencies: [{ kind: 'content', path: source, digest: bytesDigest(bytes) }],
        diagnostics: [],
        whyRebuilt: [],
      };
    },
    async dispose() {},
  };
  const sends: Array<{ type: string }> = [];
  const replayed: string[] = [];
  const server = {
    config: { logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } },
    ws: { send: (payload: { type: string }) => sends.push(payload) },
    watcher: { emit: (event: string, file: string) => replayed.push(`${event} ${file}`) },
  } as unknown as ViteDevServer;
  const lifecycle = new ViteAdapterLifecycle(acquireOutputLease(`bursts-${Date.now()}`, output));
  lifecycle.attachServer(server, undefined as never);
  const real = createOutputCommitter({ outputRoot: output });
  let watching = false;
  // The Vite watcher reports every file a commit writes, as the plugin's hot update hook forwards
  // it to the adapter.
  const committer: OutputCommitter = {
    async commit(request: CommitRequest, guard: CommitGuard, signal: AbortSignal) {
      const result = await real.commit(request, guard, signal);
      if (result.status === 'committed' && watching)
        for (const relative of result.written) {
          const file = path.join(output, relative);
          const ticket = lifecycle.hostUpdateStarted(file, 'update', () =>
            readFileSync(file, 'utf8'),
          );
          void lifecycle.hostUpdateCompleted(ticket).catch(() => undefined);
        }
      return result;
    },
    dispose: () => real.dispose(),
  };
  const session = createBuildSession({ compiler, committer }, { batchDelayMs: 0 });
  lifecycle.attachSession(session);
  lifecycle.publish(
    lifecycle.acceptInitial(await session.buildOnce({ mode: 'development' })),
    configuration,
  );
  const events = new Events();
  const results: BuildResult[] = [];
  const observe = lifecycle.observer(() => configuration);
  const watch = await session.watch(events, (event) => {
    if (event.kind === 'result') results.push(event.result);
    observe(event);
  });
  lifecycle.attachWatch(watch);
  expect((await watch.initial).status).toBe('success');
  await lifecycle.settled();
  watching = true;
  const reloads = () => sends.filter((payload) => payload.type === 'full-reload').length;
  const before = reloads();

  // A burst of file events the generator does not read (a script churning files in the docs
  // folder), as Vite's hot update hooks report them; the edit's generation fails under it.
  const churn: Array<Promise<unknown>> = [];
  for (let index = 0; index < HOST_BURST_EVENTS; index++) {
    const file = path.join(docs, `churn/f${index}.txt`);
    const ticket: HostUpdateTicket = lifecycle.hostUpdateStarted(file, 'create', () => '');
    churn.push(lifecycle.hostUpdateCompleted(ticket).catch(() => undefined));
  }
  starved = true;
  writeFileSync(source, 'two');
  events.emit({ kind: 'update', path: source });
  await vi.waitFor(() => expect(results.at(-1)?.status).toBe('failure'), { timeout: 10_000 });
  await Promise.all(churn);
  expect(readFileSync(path.join(output, 'pages/a.mjs'), 'utf8')).toBe(module('one'));

  // The pass after the burst re-observes the inputs: the edit regenerates and reloads once.
  await vi.waitFor(
    async () => {
      await lifecycle.settled();
      expect(results.at(-1)?.status).toBe('success');
      expect(reloads()).toBe(before + 1);
    },
    { timeout: HOST_BURST_QUIET_MS + 10_000 },
  );
  expect(readFileSync(path.join(output, 'pages/a.mjs'), 'utf8')).toBe(module('two'));
  expect(compiled.at(-1)?.changes).toEqual([{ kind: 'update', path: source }]);
  expect(lifecycle.failure).toBeUndefined();
  // No output obligation was open, so nothing was replayed.
  expect(replayed).toEqual([]);
  await watch.dispose();
  await lifecycle.dispose();
  await session.dispose();
}, 30_000);

it('replays through the Vite watcher, warns through its logger and rescans through the session', async () => {
  const root = directory();
  const emitted: Array<[string, string]> = [];
  const warn = vi.fn();
  const server = {
    config: { logger: { error: vi.fn(), warn, info: vi.fn() } },
    ws: { send: vi.fn() },
    watcher: { emit: (event: string, file: string) => emitted.push([event, file]) },
  } as unknown as ViteDevServer;
  const interrupt = vi.fn();
  const lifecycle = new ViteAdapterLifecycle(
    acquireOutputLease(`bursts-host-${Date.now()}`, root),
    {
      interrupt,
      release: vi.fn(),
    },
  );
  const rescan = vi.fn(async () => {});
  lifecycle.attachSession({ rescan, dispose: async () => {} } as never);
  const recovery = (lifecycle as unknown as { hostUpdates: { recovery: HostUpdateRecovery } })
    .hostUpdates.recovery;
  // Before a server is attached nothing is logged.
  recovery.warn('early');
  expect(warn).not.toHaveBeenCalled();
  lifecycle.attachServer(server, undefined as never);
  recovery.replay('/out/a.ts', 'create');
  recovery.replay('/out/b.ts', 'update');
  recovery.replay('/out/c.ts', 'delete');
  expect(emitted).toEqual([
    ['add', '/out/a.ts'],
    ['change', '/out/b.ts'],
    ['unlink', '/out/c.ts'],
  ]);
  recovery.warn('[NGDOC_VITE_HOST_TIMEOUT] summary');
  expect(warn).toHaveBeenCalledWith('[NGDOC_VITE_HOST_TIMEOUT] summary');
  expect(interrupt).toHaveBeenCalled();
  recovery.rescan();
  expect(rescan).toHaveBeenCalledOnce();
  await lifecycle.dispose();
  recovery.replay('/out/d.ts', 'update');
  recovery.rescan();
  expect(emitted).toHaveLength(3);
  expect(rescan).toHaveBeenCalledOnce();
});
