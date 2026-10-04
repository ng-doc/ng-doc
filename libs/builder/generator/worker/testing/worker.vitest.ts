import { build } from 'esbuild';
import { fork, spawn } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { CommitRequest, CompilationRequest, FileChange, JsonValue } from '../../contracts';
import type { ArtifactSnapshot, CompilationContext } from '../../contracts';
import { createBuildSession } from '../../session/build-session';
import { type WorkerCompilationOptions, createWorkerCompilationService } from '../index';
import {
  applySnapshotDelta,
  decode,
  deepFreeze,
  encode,
  errorMessage,
  FIELD_LEVEL_LIMIT,
  resultFrom,
  snapshotDelta,
} from '../protocol';

const require = createRequire(import.meta.url);
const { createInstrumenter } = require('istanbul-lib-instrument');
const { createCoverageMap } = require('istanbul-lib-coverage');
const { createContext } = require('istanbul-lib-report');
const reports = require('istanbul-reports');
let temporary: string;
let moduleUrl: URL;
let workerEntryUrl: URL;
const request = (generation = 1): CompilationRequest => ({
  generation,
  mode: 'production',
  changes: [],
});
const signal = () => new AbortController().signal;
const normalized = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const good = {
  dependencies: [],
  diagnostics: [],
  whyRebuilt: [],
  candidate: {
    projectId: 'test',
    revision: '1',
    artifacts: [],
    globalKeywords: [],
    remoteKeywords: [],
  },
};
function service(factoryOptions: JsonValue = {}, options: Partial<WorkerCompilationOptions> = {}) {
  return createWorkerCompilationService({
    moduleUrl,
    workerEntryUrl,
    factoryOptions,
    startupTimeoutMs: 2000,
    compileTimeoutMs: 300,
    ...options,
  });
}
async function waitFor(file: string): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt++) {
    try {
      await readFile(file);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw new Error(`Worker never wrote ${file}`);
}
async function fixture(name: string, source: string): Promise<URL> {
  const file = path.join(temporary, `${name}.mjs`);
  await writeFile(file, source);
  return pathToFileURL(file);
}

beforeAll(async () => {
  temporary = await mkdtemp(path.join(tmpdir(), 'ng-doc-worker-'));
  // Unbundled sibling outputs exercise the same entry.js/protocol.js ESM layout as publication.
  await build({
    entryPoints: [
      path.resolve(import.meta.dirname, '../index.ts'),
      path.resolve(import.meta.dirname, '../entry.ts'),
      path.resolve(import.meta.dirname, '../protocol.ts'),
    ],
    outdir: temporary,
    platform: 'node',
    format: 'esm',
    target: 'node24',
    sourcemap: 'inline',
  });
  await writeFile(path.join(temporary, 'package.json'), '{"type":"module"}');
  const entrySource = path.resolve(import.meta.dirname, '../entry.ts');
  const instrumenter = createInstrumenter({ esModules: true, parserPlugins: ['typescript'] });
  const instrumented = instrumenter.instrumentSync(
    await readFile(entrySource, 'utf8'),
    entrySource,
  );
  await build({
    stdin: { contents: instrumented, loader: 'ts', resolveDir: path.dirname(entrySource) },
    outfile: path.join(temporary, 'entry.js'),
    platform: 'node',
    format: 'esm',
    target: 'node24',
    // The coverage is written beside its file and renamed into place. Tests SIGKILL runtimes at
    // any point, and a runtime can outlive its test: a write in place could leave a truncated
    // file, or be read half-written, when afterAll merges the files.
    banner: {
      // A runtime that exits on its own (dispose, a recycle) writes it once more on its way out.
      js: `import { renameSync as publishCoverage, writeFileSync as saveCoverage } from 'node:fs'; const nativeSend = process.send; let coverageWrites = 0; const flushCoverage = () => { const partial = ${JSON.stringify(temporary)} + '/partial-coverage-' + process.pid + '-' + ++coverageWrites + '.json'; saveCoverage(partial, JSON.stringify(globalThis.__coverage__)); publishCoverage(partial, ${JSON.stringify(temporary)} + '/entry-coverage-' + process.pid + '.json'); }; process.on('exit', () => { try { flushCoverage(); } catch {} }); process.send = function(...args) { flushCoverage(); return nativeSend.apply(process, args); };`,
    },
  });
  workerEntryUrl = pathToFileURL(path.join(temporary, 'entry.js'));
  moduleUrl = await fixture(
    'factory',
    `
    import { writeFileSync, appendFileSync } from 'node:fs';
    import { pbkdf2Sync } from 'node:crypto';
    import { createRequire } from 'node:module';
    import { tmpdir } from 'node:os';
    import { basename } from 'node:path';
    const load = createRequire(import.meta.url);
    let calls = 0;
    let started = false;
    // The compilation module's render threads: what the runtime asks of them is logged.
    let threads;
    let threadsFail = false;
    let kept = false;
    export function keepRenderThreads(keep) { kept = keep; }
    export async function disposeRenderThreads() {
      if(threads) appendFileSync(threads, 'dispose\\n');
      if(threadsFail) throw new Error('threads failed');
    }
    export async function createCompilationService(options = {}) {
      if(options.threads) threads = options.threads;
      if(options.threadsFail) threadsFail = true;
      if(!started) {
        started = true;
        if(options.announce) appendFileSync(options.announce, process.pid + '\\n');
        if(options.startDelay) await new Promise(resolve => setTimeout(resolve, options.startDelay));
      }
      if(options.start === 'loop') while(true) {}
      if(options.start === 'hang') await new Promise(() => {});
      if(options.start === 'throw') throw new Error('factory failed');
      if(options.start === 'invalid') return {};
      if(options.start === 'null') return null;
      if(options.start === 'dispose') return { compile() {} };
      return {
        async compile(request, signal, context) {
          // Persistent-runtime tests steer one generation through its first change path.
          const directive = request.changes?.[0]?.path?.slice(1);
          if(options.marker && (!directive || directive !== 'ok')) writeFileSync(options.marker, 'started');
          if(directive === 'cooperative') await new Promise(resolve => signal.aborted ? resolve() : signal.addEventListener('abort', resolve, { once: true }));
          if(directive === 'loop') while(true) {}
          if(directive === 'hang') await new Promise(() => {});
          if(directive === 'exit') process.exit(7);
          if(directive === 'throw') throw new Error('compile failed');
          if(directive === 'invalid') return {};
          if(directive === 'nocandidate') return { dependencies: [], diagnostics: [], whyRebuilt: [] };
          const leaked = process.env.NGDOC_TEST_LEAK;
          if(directive === 'env') process.env.NGDOC_TEST_LEAK = 'leaked';
          const observed = [];
          // User code loading files through a runtime-computed require.
          if(directive === 'load') for (const file of options.load) {
            const loaded = load(file);
            observed.push({ ownerId: basename(file), reason: JSON.stringify(loaded?.default ?? loaded) });
          }
          // User code leaking host-realm state.
          if(directive === 'leak') {
            observed.push({ ownerId: 'state', reason: JSON.stringify({ exit: process.listenerCount('exit'), signal: process.listenerCount('SIGUSR2'), umask: process.umask(), cwd: process.cwd(), host: process.env.NGDOC_TEST_HOST ?? null }) });
            process.on('exit', () => {});
            process.once('SIGUSR2', () => {});
            process.umask(0o077);
            process.chdir(tmpdir());
            process.env.NGDOC_TEST_HOST = 'leaked';
          }
          // A host-realm handle left behind.
          if(directive === 'interval') setInterval(() => {}, 1000);
          if(options.log) appendFileSync(options.log, 'start ' + request.generation + '\\n');
          if(options.threads) appendFileSync(options.threads, 'compile kept ' + kept + '\\n');
          if(options.mode === 'loop') while(true) {}
          if(options.mode === 'native') pbkdf2Sync('p','s',2147483647,32,'sha512');
          if(options.mode === 'hang') await new Promise(() => {});
          if(options.mode === 'exit') process.exit(7);
          if(options.mode === 'crash') { setImmediate(() => { throw new Error('worker crashed') }); await new Promise(() => {}); }
          if(options.mode === 'throw') throw new Error('compile failed');
          if(options.mode === 'invalid') return {};
          if(options.delay) await new Promise(resolve => setTimeout(resolve, options.delay));
          // Delta transport tests: a candidate derived from the previous snapshot.
          // Change paths '/touch:<id>:<body>', '/add:<id>:<body>', '/remove:<id>' edit artifacts.
          if(options.snapshot) {
            const previous = request.previous;
            const artifacts = (previous?.artifacts ?? [{ id: 'a', revision: 'a0', body: 'a0', meta: { big: 'x'.repeat(64) } }, { id: 'b', revision: 'b0', body: 'b0', meta: { big: 'y'.repeat(64) } }]).map((artifact) => ({ ...artifact, note: undefined }));
            for (const change of request.changes ?? []) {
              const [op, id, body] = change.path.slice(1).split(':');
              const index = artifacts.findIndex((artifact) => artifact.id === id);
              if(op === 'touch') artifacts[index] = { ...artifacts[index], revision: id + body, body };
              if(op === 'add') artifacts.push({ id, revision: id + body, body, meta: { big: 'z' } });
              if(op === 'remove') artifacts.splice(index, 1);
            }
            if(request.changes?.some((change) => change.path === '/mutate') && previous) previous.artifacts[0].body = 'mutated';
            // Two artifacts with one id: no delta can describe it, so the full candidate is sent.
            if(request.changes?.some((change) => change.path === '/duplicate')) artifacts.push({ ...artifacts[0] });
            if(request.changes?.some((change) => change.path === '/none')) return { dependencies: [], diagnostics: [], whyRebuilt: [{ ownerId: 'previous', reason: previous?.revision ?? 'none' }] };
            return {
              candidate: { projectId: 'test', revision: artifacts.map((artifact) => artifact.revision).join('|'), artifacts, globalKeywords: previous?.globalKeywords ?? [], remoteKeywords: [], frozen: previous ? Object.isFrozen(previous) : null },
              dependencies: request.changes?.some((change) => change.path === '/function') ? [{ execute() {} }] : [], diagnostics: [],
              whyRebuilt: [{ ownerId: 'previous', reason: previous?.revision ?? 'none' }, { ownerId: 'context', reason: JSON.stringify(context ?? null) }],
            };
          }
          const value = ${JSON.stringify(good)};
          value.candidate.revision = request.generation + ':' + ++calls;
          if(options.pid) value.candidate.projectId = String(process.pid);
          // The runtime lifetime the worker entry passed to the compiler.
          if(options.context) value.whyRebuilt.push({ ownerId: 'context', reason: JSON.stringify(context ?? null) });
          if(directive === 'error') value.diagnostics.push({ code: 'FIXTURE_ERROR', message: 'fixture error', severity: 'error', stage: 'content' });
          if(directive === 'env' && leaked) value.whyRebuilt.push({ ownerId: 'env', reason: 'leaked' });
          value.whyRebuilt.push(...observed);
          if(directive === 'function') value.dependencies.push({ execute(){} });
          if(options.mode === 'function') value.dependencies.push({ execute(){} });
          if(options.log) appendFileSync(options.log, 'end ' + request.generation + '\\n');
          // Retains a program for the candidate, as the compiler of a long-lived runtime does.
          if(options.retain && context?.retention) context.retention.offer({ base: value.candidate.revision });
          return value;
        },
        async dispose() {
          if(options.dispose === 'hang') await new Promise(() => {});
          if(options.dispose === 'throw') throw new Error('dispose failed');
          if(options.disposed) writeFileSync(options.disposed, 'disposed');
          if(options.disposals) appendFileSync(options.disposals, 'disposed\\n');
        }
      }
    }
  `,
  );
});
afterAll(async () => {
  const coverage = createCoverageMap({});
  for (const file of await readdir(temporary)) {
    if (file.startsWith('entry-coverage-'))
      coverage.merge(JSON.parse(await readFile(path.join(temporary, file), 'utf8')));
  }
  // Evidence is written only where a runner asks for it; a plain run never touches tracked docs.
  const directory = process.env['NGDOC_TEST_EVIDENCE_DIR']
    ? path.resolve(process.env['NGDOC_TEST_EVIDENCE_DIR'], 'entry-coverage')
    : path.join(temporary, 'entry-coverage');
  try {
    const context = createContext({ dir: directory, coverageMap: coverage });
    reports.create('json').execute(context);
    reports.create('json-summary').execute(context);
    reports.create('text').execute(context);
    const summary = coverage.getCoverageSummary().toJSON();
    for (const metric of ['lines', 'statements', 'functions'])
      expect(summary[metric].pct).toBeGreaterThanOrEqual(90);
    expect(summary.branches.pct).toBeGreaterThanOrEqual(85);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

describe('real disposable compilation workers', () => {
  it('loads the factory, transports DTOs, disposes and bounds module state across 100 lifecycles', async () => {
    const disposed = path.join(temporary, 'disposed');
    const proxy = service({ disposed });
    const nativeHandles = () =>
      process
        .getActiveResourcesInfo()
        .filter((type) => type === 'ProcessWrap' || type === 'PipeWrap')
        .sort();
    const baseline = nativeHandles();
    for (let generation = 1; generation <= 100; generation++) {
      const result = await proxy.compile(request(generation), signal());
      expect(result.candidate?.revision).toBe(`${generation}:1`);
    }
    expect(await readFile(disposed, 'utf8')).toBe('disposed');
    expect(nativeHandles()).toEqual(baseline);
    await proxy.dispose();
  });
  it('resolves default published ESM sibling worker entry', async () => {
    const published = await import(
      /* @vite-ignore */ pathToFileURL(path.join(temporary, 'index.js')).href
    );
    const proxy = published.createWorkerCompilationService({ moduleUrl });
    expect((await proxy.compile(request(), signal())).candidate.revision).toBe('1:1');
    await proxy.dispose();
  });
  it('serializes bounded requests, removes aborted queued work and isolates caller mutation', async () => {
    const log = path.join(temporary, 'serial');
    const proxy = service({ delay: 50, log }, { maxPendingRequests: 3 });
    const one = proxy.compile(request(1), signal());
    const abort = new AbortController();
    const two = proxy.compile(request(2), abort.signal);
    const input = request(3);
    const three = proxy.compile(input, signal());
    input.generation = 999;
    expect((await proxy.compile(request(4), signal())).diagnostics[0].code).toBe(
      'WORKER_QUEUE_FULL',
    );
    abort.abort();
    expect((await two).diagnostics[0].code).toBe('WORKER_ABORTED');
    expect((await one).candidate?.revision).toBe('1:1');
    expect((await three).candidate?.revision).toBe('3:1');
    expect(await readFile(log, 'utf8')).toBe('start 1\nend 1\nstart 3\nend 3\n');
    await proxy.dispose();
  });
  it.each(['loop', 'hang', 'native'])(
    'abort preempts %s and permits a fresh request',
    async (mode) => {
      const marker = path.join(temporary, `abort-${mode}`);
      const proxy = service({ mode, marker }, { compileTimeoutMs: 5000 });
      const controller = new AbortController();
      const pending = proxy.compile(request(), controller.signal);
      await waitFor(marker);
      if (mode === 'native') await new Promise((resolve) => setTimeout(resolve, 30));
      controller.abort();
      expect((await pending).diagnostics[0].code).toBe('WORKER_ABORTED');
      // Same supervisor restarts; a second controller also preempts the independent runtime.
      const next = new AbortController();
      const restarted = proxy.compile(request(2), next.signal);
      next.abort();
      expect((await restarted).candidate).toBeUndefined();
      await proxy.dispose();
    },
  );
  it.each(['loop', 'hang', 'native'])('enforces compile deadline for %s', async (mode) => {
    const proxy = service({ mode }, { compileTimeoutMs: 60 });
    expect((await proxy.compile(request(), signal())).diagnostics[0].code).toBe(
      'WORKER_COMPILE_TIMEOUT',
    );
    await proxy.dispose();
  });
  it.each(['loop', 'hang'])('enforces startup deadline for %s', async (start) => {
    const proxy = service({ start }, { startupTimeoutMs: 100 });
    expect((await proxy.compile(request(), signal())).diagnostics[0].code).toBe(
      'WORKER_STARTUP_TIMEOUT',
    );
    await proxy.dispose();
  });
  it.each(['throw', 'invalid', 'null', 'dispose'])('contains factory %s', async (start) => {
    const proxy = service({ start });
    expect((await proxy.compile(request(), signal())).diagnostics[0].code).toBe('WORKER_STARTUP');
    await proxy.dispose();
  });
  it.each(['throw', 'invalid', 'function', 'exit', 'crash'])(
    'contains compile %s without returning a candidate',
    async (mode) => {
      const proxy = service({ mode });
      const result = await proxy.compile(request(), signal());
      expect(result.candidate).toBeUndefined();
      expect(result.diagnostics[0].code).toBe(
        mode === 'exit' ? 'WORKER_EXIT' : mode === 'crash' ? 'WORKER_EXIT' : 'WORKER_COMPILE',
      );
      await proxy.dispose();
    },
  );
  it.each(['throw', 'hang'])('bounds disposal %s', async (dispose) => {
    const proxy = service({ dispose }, { compileTimeoutMs: 50 });
    expect((await proxy.compile(request(), signal())).diagnostics[0].code).toBe(
      dispose === 'hang' ? 'WORKER_COMPILE_TIMEOUT' : 'WORKER_COMPILE',
    );
    await proxy.dispose();
  });
  it('restarts successfully after a worker crashes and module is corrected', async () => {
    const url = await fixture('recovery', 'throw new Error("broken import");');
    const proxy = service({}, { moduleUrl: url });
    expect((await proxy.compile(request(), signal())).candidate).toBeUndefined();
    await writeFile(url, await readFile(moduleUrl));
    expect((await proxy.compile(request(2), signal())).candidate?.revision).toBe('2:1');
    await proxy.dispose();
  });
  it('contains missing exports, missing module and invalid entry construction', async () => {
    for (const url of [
      await fixture('no-export', 'export const x = 1;'),
      pathToFileURL(path.join(temporary, 'missing.mjs')),
    ]) {
      const proxy = service({}, { moduleUrl: url });
      expect((await proxy.compile(request(), signal())).diagnostics[0].code).toBe('WORKER_STARTUP');
      await proxy.dispose();
    }
    const proxy = service({}, { workerEntryUrl: new URL('https://invalid.example/entry.js') });
    expect((await proxy.compile(request(), signal())).diagnostics[0].code).toBe('WORKER_STARTUP');
    await proxy.dispose();
  });
  it('ignores stale replies and contains malformed replies', async () => {
    const stale = await fixture(
      'stale-entry',
      `process.once('message', () => { process.send(JSON.stringify({type:'ready'})); process.once('message', text => {const {id} = JSON.parse(text); process.send(JSON.stringify({type:'result',id:id+1,result:${JSON.stringify({ ...good, candidate: { ...good.candidate, revision: 'stale' } })}})); process.send(JSON.stringify({type:'result',id,result:${JSON.stringify(good)}}));});});`,
    );
    const proxy = service({}, { workerEntryUrl: stale });
    expect((await proxy.compile(request(), signal())).candidate?.revision).toBe('1');
    await proxy.dispose();
    const bad = await fixture('bad-entry', `process.send('invalid');`);
    const badProxy = service({}, { workerEntryUrl: bad });
    expect((await badProxy.compile(request(), signal())).diagnostics[0].code).toBe(
      'WORKER_PROTOCOL',
    );
    await badProxy.dispose();
  });
  it('rejects malformed startup and compile IPC in the actual entry process', async () => {
    async function exchange(initial: string, message?: string) {
      const child = fork(workerEntryUrl, [], {
        execArgv: [],
        stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      });
      return new Promise<Record<string, unknown>>((resolve, reject) => {
        const timeout = setTimeout(() => {
          child.kill('SIGKILL');
          reject(new Error('IPC test timed out'));
        }, 2000);
        child.on('message', (reply) => {
          const parsed = decode(reply);
          if (parsed['type'] === 'ready' && message) child.send(message);
          else {
            child.kill('SIGKILL');
            child.once('close', () => {
              clearTimeout(timeout);
              resolve(parsed);
            });
          }
        });
        child.send(initial);
      });
    }
    expect((await exchange('{}'))['type']).toBe('failure');
    for (const message of [
      'invalid',
      '{"type":"bad","id":1}',
      '{"type":"compile","id":"invalid"}',
    ]) {
      expect((await exchange(encode({ moduleUrl: moduleUrl.href }), message))['type']).toBe(
        'failure',
      );
    }
  });
  it('settles active/queued calls and cleanup idempotently on dispose, including startup', async () => {
    const proxy = service({ start: 'hang' });
    const active = proxy.compile(request(), signal());
    const queued = proxy.compile(request(2), signal());
    const disposing = proxy.dispose();
    expect(proxy.dispose()).toBe(disposing);
    await disposing;
    expect((await active).diagnostics[0].code).toBe('WORKER_DISPOSED');
    expect((await queued).diagnostics[0].code).toBe('WORKER_DISPOSED');
    expect((await proxy.compile(request(), signal())).diagnostics[0].code).toBe('WORKER_DISPOSED');
  });
  it('rejects pre-aborted signals, non-JSON input and invalid limits', async () => {
    const proxy = service();
    const controller = new AbortController();
    controller.abort();
    expect((await proxy.compile(request(), controller.signal)).diagnostics[0].code).toBe(
      'WORKER_ABORTED',
    );
    expect(
      (await proxy.compile({ ...request(), generation: Infinity }, signal())).diagnostics[0].code,
    ).toBe('WORKER_INPUT');
    for (const value of [0, -1, NaN, Infinity, 1.5, 2147483648])
      expect(() => service({}, { maxPendingRequests: value })).toThrow();
    await proxy.dispose();
  });
});

describe('persistent development worker', () => {
  const watch = { lifetime: 'watch' as const };
  const directive = (generation: number, name: string, previous?: string): CompilationRequest => ({
    ...request(generation),
    mode: 'development',
    changes: [{ kind: 'update', path: `/${name}` }],
    ...(previous ? { previous: { ...good.candidate, revision: previous } } : {}),
  });
  const pidOf = (result: { candidate?: { projectId: string } }) =>
    Number(result.candidate?.projectId);
  const gone = async (pid: number) => {
    for (let attempt = 0; attempt < 200; attempt++) {
      try {
        process.kill(pid, 0);
      } catch {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(`Process ${pid} is still alive`);
  };
  function persistentService(
    factoryOptions: JsonValue = {},
    options: Partial<WorkerCompilationOptions> = {},
  ) {
    return service(
      { pid: true, ...(factoryOptions as object) },
      { compileTimeoutMs: 5000, ...options },
    );
  }

  it('serves watch generations from one runtime, disposing a service per generation, and keeps other generations one-shot', async () => {
    const disposals = path.join(temporary, 'persistent-disposals');
    const proxy = persistentService({ disposals });
    const first = await proxy.compile(directive(1, 'ok'), signal(), watch);
    const second = await proxy.compile(directive(2, 'ok'), signal(), watch);
    const third = await proxy.compile(directive(3, 'ok'), signal(), watch);
    // One module evaluation: its call counter keeps counting in the same process.
    expect([first, second, third].map((result) => result.candidate?.revision)).toEqual([
      '1:1',
      '2:2',
      '3:3',
    ]);
    expect(new Set([first, second, third].map(pidOf)).size).toBe(1);
    // The startup probe plus one service per generation, each disposed before its reply.
    expect((await readFile(disposals, 'utf8')).trim().split('\n')).toHaveLength(4);
    // buildOnce / production: no context, or the generation lifetime, is a fresh runtime.
    const once = await proxy.compile(request(4), signal());
    const production = await proxy.compile(request(5), signal(), { lifetime: 'generation' });
    expect([once.candidate?.revision, production.candidate?.revision]).toEqual(['4:1', '5:1']);
    expect(new Set([pidOf(first), pidOf(once), pidOf(production)]).size).toBe(3);
    expect(pidOf(await proxy.compile(directive(6, 'ok'), signal(), watch))).toBe(pidOf(first));
    await proxy.dispose();
    await gone(pidOf(first));
  });

  it('keeps the render threads across watch generations and terminates them before the runtime exits', async () => {
    const threads = path.join(temporary, 'threads-persistent');
    const proxy = persistentService({ threads });
    await proxy.watching?.(true);
    const first = await proxy.compile(directive(1, 'ok'), signal(), watch);
    await proxy.compile(directive(2, 'ok'), signal(), watch);
    // The watch stops: the runtime is asked to exit, and does once its threads are gone.
    await proxy.watching?.(false);
    await gone(pidOf(first));
    expect((await readFile(threads, 'utf8')).trim().split('\n')).toEqual([
      'compile kept true',
      'compile kept true',
      'dispose',
    ]);
    await proxy.dispose();

    // A one-shot runtime terminates them before it replies, even when that fails.
    const oneShot = path.join(temporary, 'threads-one-shot');
    const once = persistentService({ threads: oneShot, threadsFail: true }, { persistent: false });
    expect((await once.compile(request(3), signal())).candidate?.revision).toBe('3:1');
    expect((await readFile(oneShot, 'utf8')).trim().split('\n')).toEqual([
      'compile kept false',
      'dispose',
    ]);
    await once.dispose();

    // A failure to terminate them does not keep a long-lived runtime alive.
    const failing = path.join(temporary, 'threads-failing');
    const stuck = persistentService({ threads: failing, threadsFail: true });
    await stuck.watching?.(true);
    const served = await stuck.compile(directive(1, 'ok'), signal(), watch);
    await stuck.watching?.(false);
    await gone(pidOf(served));
    expect((await readFile(failing, 'utf8')).trim().split('\n')).toEqual([
      'compile kept true',
      'dispose',
    ]);
    await stuck.dispose();
  });

  it('runs watch generations one-shot when persistence is disabled and rejects invalid limits', async () => {
    const proxy = persistentService({}, { persistent: false });
    const first = await proxy.compile(directive(1, 'ok'), signal(), watch);
    const second = await proxy.compile(directive(2, 'ok'), signal(), watch);
    expect([first.candidate?.revision, second.candidate?.revision]).toEqual(['1:1', '2:1']);
    expect(pidOf(first)).not.toBe(pidOf(second));
    await proxy.dispose();
    for (const persistent of [
      { abortGraceMs: 0 },
      { maxGenerations: 1.5 },
      { maxRssBytes: -1 },
      { maxRssBytes: 2 ** 60 },
    ])
      expect(() => service({}, { persistent })).toThrow();
    expect(() => service({}, { persistent: true })).not.toThrow();
  });

  it('aborts cooperatively and keeps the warm runtime; ignores of the abort are SIGKILLed after the grace', async () => {
    const marker = path.join(temporary, 'persistent-cooperative');
    const proxy = persistentService({ marker }, { persistent: { abortGraceMs: 200 } });
    const warm = await proxy.compile(directive(1, 'ok'), signal(), watch);
    const controller = new AbortController();
    const pending = proxy.compile(directive(2, 'cooperative'), controller.signal, watch);
    await waitFor(marker);
    const started = Date.now();
    controller.abort();
    expect((await pending).diagnostics[0].code).toBe('WORKER_ABORTED');
    expect(Date.now() - started).toBeLessThan(200);
    const after = await proxy.compile(directive(3, 'ok'), signal(), watch);
    expect(pidOf(after)).toBe(pidOf(warm));
    expect(after.candidate?.revision).toBe('3:3');
    // A compile that ignores the abort is killed after the grace; the next one is cold and correct.
    for (const mode of ['loop', 'hang']) {
      const looping = new AbortController();
      await rm(marker, { force: true });
      const stuck = proxy.compile(directive(4, mode), looping.signal, watch);
      await waitFor(marker);
      const aborted = Date.now();
      looping.abort();
      expect((await stuck).diagnostics[0].code).toBe('WORKER_ABORTED');
      expect(Date.now() - aborted).toBeGreaterThanOrEqual(150);
      await gone(pidOf(after));
      const cold = await proxy.compile(directive(5, 'ok'), signal(), watch);
      expect(cold.candidate?.revision).toBe('5:1');
      expect(pidOf(cold)).not.toBe(pidOf(after));
      await proxy.compile(directive(6, 'ok'), signal(), watch);
      Object.assign(after, cold);
    }
    await proxy.dispose();
  });

  it('replaces a runtime that exits, hangs past the deadline or breaks the protocol, and survives a compile error', async () => {
    const proxy = persistentService({}, { compileTimeoutMs: 300 });
    const first = await proxy.compile(directive(1, 'ok'), signal(), watch);
    expect((await proxy.compile(directive(2, 'throw'), signal(), watch)).diagnostics[0].code).toBe(
      'WORKER_COMPILE',
    );
    const survived = await proxy.compile(directive(3, 'ok'), signal(), watch);
    expect(pidOf(survived)).toBe(pidOf(first));
    expect(
      (await proxy.compile(directive(4, 'invalid'), signal(), watch)).diagnostics[0].code,
    ).toBe('WORKER_COMPILE');
    expect((await proxy.compile(directive(5, 'exit'), signal(), watch)).diagnostics[0].code).toBe(
      'WORKER_EXIT',
    );
    const restarted = await proxy.compile(directive(6, 'ok'), signal(), watch);
    expect(restarted.candidate?.revision).toBe('6:1');
    expect((await proxy.compile(directive(7, 'hang'), signal(), watch)).diagnostics[0].code).toBe(
      'WORKER_COMPILE_TIMEOUT',
    );
    await gone(pidOf(restarted));
    const again = await proxy.compile(directive(8, 'ok'), signal(), watch);
    expect(again.candidate?.revision).toBe('8:1');
    await proxy.dispose();
  });

  it('recycles an idle runtime after maxGenerations or above maxRssBytes and warms the replacement while watching', async () => {
    const announce = path.join(temporary, 'persistent-announce');
    const proxy = persistentService({ announce }, { persistent: { maxGenerations: 2 } });
    await proxy.watching?.(true);
    await waitFor(announce);
    const first = await proxy.compile(directive(1, 'ok'), signal(), watch);
    const second = await proxy.compile(directive(2, 'ok'), signal(), watch);
    expect(pidOf(second)).toBe(pidOf(first));
    // Recycled at idle; the replacement starts before the next generation asks for it.
    await gone(pidOf(first));
    await vi.waitFor(async () =>
      expect((await readFile(announce, 'utf8')).trim().split('\n')).toHaveLength(2),
    );
    const third = await proxy.compile(directive(3, 'ok'), signal(), watch);
    expect(third.candidate?.revision).toBe('3:1');
    expect(Number((await readFile(announce, 'utf8')).trim().split('\n')[1])).toBe(pidOf(third));
    // Ending the watch ends the runtime; later watch generations start one on demand.
    await proxy.watching?.(false);
    await gone(pidOf(third));
    await proxy.dispose();
    // The rss budget is checked against the runtime's report after its idle collection: the idle
    // runtime is replaced once that report arrives.
    const small = persistentService({}, { persistent: { maxRssBytes: 1 } });
    const a = await small.compile(directive(1, 'ok'), signal(), watch);
    await gone(pidOf(a));
    const b = await small.compile(directive(2, 'ok'), signal(), watch);
    expect(pidOf(a)).not.toBe(pidOf(b));
    expect(small.transport().idleRss).toBeGreaterThan(1);
    await small.dispose();
  });

  it('ends the runtime after the watch generation it serves when the watch stops mid-generation', async () => {
    const announce = path.join(temporary, 'persistent-stop-running');
    const marker = path.join(temporary, 'persistent-stop-marker');
    const proxy = persistentService({ announce, marker });
    await proxy.watching?.(true);
    const controller = new AbortController();
    const pending = proxy.compile(directive(1, 'cooperative'), controller.signal, watch);
    await waitFor(marker);
    const pid = Number((await readFile(announce, 'utf8')).trim());
    const stopped = proxy.watching?.(false);
    process.kill(pid, 0);
    controller.abort();
    expect((await pending).diagnostics[0].code).toBe('WORKER_ABORTED');
    await stopped;
    await gone(pid);
    await proxy.dispose();
  });

  it('restores process.env between watch generations', async () => {
    const proxy = persistentService();
    const first = await proxy.compile(directive(1, 'env'), signal(), watch);
    const second = await proxy.compile(directive(2, 'env'), signal(), watch);
    expect(pidOf(first)).toBe(pidOf(second));
    expect(first.whyRebuilt).toEqual([]);
    expect(second.whyRebuilt).toEqual([]);
    await proxy.dispose();
  });

  it('keeps the runtime warming when a generation is aborted during startup, and reports startup failures', async () => {
    const announce = path.join(temporary, 'persistent-slow');
    const proxy = persistentService({ announce, startDelay: 300 });
    const controller = new AbortController();
    const pending = proxy.compile(directive(1, 'ok'), controller.signal, watch);
    await waitFor(announce);
    controller.abort();
    expect((await pending).diagnostics[0].code).toBe('WORKER_ABORTED');
    const next = await proxy.compile(directive(2, 'ok'), signal(), watch);
    expect(Number((await readFile(announce, 'utf8')).trim())).toBe(pidOf(next));
    await proxy.dispose();
    for (const [factoryOptions, code, limits] of [
      [{ start: 'throw' }, 'WORKER_STARTUP', {}],
      [{ start: 'dispose' }, 'WORKER_STARTUP', {}],
      [{ start: 'hang' }, 'WORKER_STARTUP_TIMEOUT', { startupTimeoutMs: 100 }],
    ] as const) {
      const broken = persistentService(factoryOptions, limits);
      expect((await broken.compile(directive(1, 'ok'), signal(), watch)).diagnostics[0].code).toBe(
        code,
      );
      await broken.dispose();
    }
    const missing = persistentService(
      {},
      { moduleUrl: pathToFileURL(path.join(temporary, 'missing.mjs')) },
    );
    expect((await missing.compile(directive(1, 'ok'), signal(), watch)).diagnostics[0].code).toBe(
      'WORKER_STARTUP',
    );
    await missing.dispose();
  });

  it('settles an active watch generation and the idle runtime on dispose', async () => {
    const marker = path.join(temporary, 'persistent-dispose');
    const proxy = persistentService({ marker });
    const warm = await proxy.compile(directive(1, 'ok'), signal(), watch);
    const active = proxy.compile(directive(2, 'hang'), signal(), watch);
    await waitFor(marker);
    const queued = proxy.compile(directive(3, 'ok'), signal(), watch);
    await proxy.dispose();
    expect((await active).diagnostics[0].code).toBe('WORKER_DISPOSED');
    expect((await queued).diagnostics[0].code).toBe('WORKER_DISPOSED');
    await gone(pidOf(warm));
    const idle = persistentService();
    const idlePid = pidOf(await idle.compile(directive(1, 'ok'), signal(), watch));
    await idle.dispose();
    await gone(idlePid);
    expect((await idle.compile(directive(2, 'ok'), signal(), watch)).diagnostics[0].code).toBe(
      'WORKER_DISPOSED',
    );
    await idle.watching?.(true);
  });

  it('resyncs the base revision before a compile for a different base, and replaces a runtime that disagrees', async () => {
    const log = path.join(temporary, 'persistent-handshake');
    const fake = await fixture(
      'handshake-entry',
      `import { appendFileSync } from 'node:fs';
      let base = null;
      process.once('message', () => {
        process.channel.ref();
        process.on('message', (text) => {
          const message = JSON.parse(text);
          appendFileSync(${JSON.stringify(log)}, JSON.stringify({ pid: process.pid, type: message.type, base: message.base ?? null }) + '\\n');
          if (message.type === 'resync') {
            base = message.base;
            process.send(JSON.stringify({ type: 'resynced', base: message.base === 'wrong' ? 'other' : base }));
          }
          if (message.type === 'compile') {
            if (message.request.changes[0]?.path === '/bad-json') return process.send('not json');
            if (message.request.changes[0]?.path === '/bad-result') return process.send(JSON.stringify({ type: 'result', id: message.id, result: {} }));
            if (message.request.changes[0]?.path === '/mismatch') return process.send(JSON.stringify({ type: 'failure', id: message.id, code: 'WORKER_BASE_MISMATCH', message: 'mismatch' }));
            process.send(JSON.stringify({ type: 'result', id: message.id + 1000, result: ${JSON.stringify(good)} }));
            process.send(JSON.stringify({ type: 'result', id: message.id, rss: 1, result: ${JSON.stringify(good)} }));
          }
        });
        process.send(JSON.stringify({ type: 'ready', base: null }));
      });`,
    );
    const proxy = service({}, { workerEntryUrl: fake });
    expect((await proxy.compile(directive(1, 'ok'), signal(), watch)).candidate?.revision).toBe(
      '1',
    );
    expect(
      (await proxy.compile(directive(2, 'ok', 'r1'), signal(), watch)).candidate?.revision,
    ).toBe('1');
    expect(
      (await proxy.compile(directive(3, 'ok', 'r1'), signal(), watch)).candidate?.revision,
    ).toBe('1');
    const lines = (await readFile(log, 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(lines.map((line) => `${line.type}:${line.base}`)).toEqual([
      'compile:null',
      'resync:r1',
      'compile:r1',
      'compile:r1',
    ]);
    for (const [name, previous] of [
      ['ok', 'wrong'],
      ['mismatch', 'r1'],
      ['bad-json', 'r1'],
      ['bad-result', 'r1'],
    ]) {
      const before = (await readFile(log, 'utf8')).trim().split('\n').length;
      expect(
        (await proxy.compile(directive(4, name, previous), signal(), watch)).diagnostics[0].code,
      ).toBe('WORKER_PROTOCOL');
      const after = (await readFile(log, 'utf8'))
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
      await gone(after[before].pid);
    }
    await proxy.dispose();
  });

  it('rejects malformed persistent IPC in the actual entry process', async () => {
    const child = fork(workerEntryUrl, [], {
      execArgv: [],
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    });
    const replies: Array<Record<string, unknown>> = [];
    const exited = new Promise<number | null>((resolve) => child.once('exit', resolve));
    const idles: Array<Record<string, unknown>> = [];
    child.on('message', (reply) => {
      const decoded = decode(reply);
      (decoded['type'] === 'idle' ? idles : replies).push(decoded);
    });
    const reply = async (count: number) => {
      for (let attempt = 0; attempt < 200 && replies.length < count; attempt++)
        await new Promise((resolve) => setTimeout(resolve, 10));
      return replies[count - 1];
    };
    child.send(encode({ moduleUrl: moduleUrl.href, factoryOptions: {}, persistent: true }));
    expect(await reply(1)).toEqual({ type: 'ready', base: null, delta: true });
    child.send('invalid');
    expect((await reply(2))['type']).toBe('failure');
    child.send(encode({ type: 'bad', id: 1 }));
    expect(await reply(3)).toMatchObject({ type: 'failure', id: 1 });
    child.send(encode({ type: 'resync', base: 1 }));
    expect((await reply(4))['type']).toBe('failure');
    child.send(encode({ type: 'compile', id: 2, base: 'x', request: request(1) }));
    expect(await reply(5)).toMatchObject({ type: 'failure', id: 2, code: 'WORKER_BASE_MISMATCH' });
    child.send(encode({ type: 'resync', base: 'x' }));
    expect(await reply(6)).toEqual({
      type: 'resynced',
      base: 'x',
      state: { base: 'x', committed: null, working: null },
    });
    child.send(encode({ type: 'abort', id: 99 }));
    child.send(encode({ type: 'compile', id: 3, base: 'x', request: request(1) }));
    expect(await reply(7)).toMatchObject({ type: 'result', id: 3 });
    // Malformed or unusable host state is ignored; the generation still runs.
    child.send(encode({ type: 'compile', id: 4, base: 'x', request: request(1), host: 'bad' }));
    expect(await reply(8)).toMatchObject({ type: 'result', id: 4 });
    child.send(
      encode({
        type: 'compile',
        id: 5,
        base: 'x',
        request: request(1),
        host: { env: null, cwd: path.join(temporary, 'missing-directory') },
      }),
    );
    expect(await reply(9)).toMatchObject({ type: 'result', id: 5 });
    child.send(encode({ type: 'dispose' }));
    expect(await exited).toBe(0);
  });

  it('exits after the running generation when disposed mid-compile', async () => {
    const marker = path.join(temporary, 'persistent-dispose-running');
    const child = fork(workerEntryUrl, [], {
      execArgv: [],
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    });
    const replies: Array<Record<string, unknown>> = [];
    const exited = new Promise<number | null>((resolve) => child.once('exit', resolve));
    const idles: Array<Record<string, unknown>> = [];
    child.on('message', (reply) => {
      const decoded = decode(reply);
      (decoded['type'] === 'idle' ? idles : replies).push(decoded);
    });
    child.send(encode({ moduleUrl: moduleUrl.href, factoryOptions: { marker }, persistent: true }));
    for (let attempt = 0; attempt < 200 && !replies.length; attempt++)
      await new Promise((resolve) => setTimeout(resolve, 10));
    expect(replies[0]).toEqual({ type: 'ready', base: null, delta: true });
    child.send(
      encode({ type: 'compile', id: 1, base: null, request: directive(1, 'cooperative') }),
    );
    await waitFor(marker);
    child.send(encode({ type: 'dispose' }));
    expect(await exited).toBe(0);
    expect(replies.at(-1)).toMatchObject({ type: 'result', id: 1 });
  });

  it('tells the compiler its runtime lifetime: watch in the long-lived runtime, generation in a one-shot one', async () => {
    const lifetime = (result: { whyRebuilt: Array<{ ownerId: string; reason: string }> }) =>
      result.whyRebuilt.find((item) => item.ownerId === 'context')?.reason;
    const proxy = persistentService({ context: true });
    // A development generation before any watch (a startup buildOnce) runs in the long-lived
    // runtime, which keeps its program for the watch that follows.
    const startup = await proxy.compile(directive(0, 'ok'), signal(), { lifetime: 'generation' });
    expect(lifetime(startup)).toBe(JSON.stringify({ lifetime: 'watch' }));
    const first = await proxy.compile(directive(1, 'ok'), signal(), watch);
    expect(lifetime(first)).toBe(JSON.stringify({ lifetime: 'watch' }));
    expect(pidOf(first)).toBe(pidOf(startup));
    expect(lifetime(await proxy.compile(request(2), signal()))).toBe(
      JSON.stringify({ lifetime: 'generation' }),
    );
    expect(
      lifetime(await proxy.compile(directive(3, 'ok'), signal(), { lifetime: 'generation' })),
    ).toBe(JSON.stringify({ lifetime: 'generation' }));
    await proxy.dispose();
    // Without the persistent runtime a watch generation runs one-shot, so it cannot retain either.
    const oneShot = persistentService({ context: true }, { persistent: false });
    expect(lifetime(await oneShot.compile(directive(1, 'ok'), signal(), watch))).toBe(
      JSON.stringify({ lifetime: 'generation' }),
    );
    await oneShot.dispose();
    // Without warm-ups (or with the retained program off) the startup stays one-shot.
    for (const [factory, persistent] of [
      [{ context: true }, { prime: false }],
      [{ context: true, incrementalReuse: false }, {}],
    ] as const) {
      const service = persistentService(factory, { persistent });
      expect(
        lifetime(await service.compile(directive(0, 'ok'), signal(), { lifetime: 'generation' })),
      ).toBe(JSON.stringify({ lifetime: 'generation' }));
      await service.dispose();
    }
  });
});

describe('priming the persistent development worker', () => {
  const watch = { lifetime: 'watch' as const };
  const warmUp = (generation: number, name = 'ok', previous = 'base'): CompilationRequest => ({
    ...request(generation),
    mode: 'development',
    changes: name === 'ok' ? [] : [{ kind: 'update', path: `/${name}` }],
    previous: { ...good.candidate, revision: previous },
  });
  const step = (generation: number, name = 'ok', previous = 'base'): CompilationRequest => ({
    ...warmUp(generation, name, previous),
    changes: [{ kind: 'update', path: `/${name}` }],
  });
  const pidOf = (result: { candidate?: { projectId: string } }) =>
    Number(result.candidate?.projectId);
  const running = async (announce: string) => Number((await readFile(announce, 'utf8')).trim());
  const alive = (pid: number) => {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  };
  function primable(
    factoryOptions: JsonValue = {},
    options: Partial<WorkerCompilationOptions> = {},
  ) {
    return service(
      { pid: true, ...(factoryOptions as object) },
      { compileTimeoutMs: 5000, ...options },
    );
  }

  it('compiles in the idle watch runtime, keeps the candidate there and serves the next generation from it', async () => {
    const announce = path.join(temporary, 'prime-announce');
    const log = path.join(temporary, 'prime-log');
    const proxy = primable({ announce, log, context: true });
    await proxy.watching?.(true);
    const outcome = await proxy.prime!(warmUp(1), signal());
    // The fixture's revision is `<generation>:<calls in this module>`: only the revision crosses.
    expect(outcome).toEqual({ status: 'primed', revision: '1:1' });
    const pid = await running(announce);
    const edit = await proxy.compile(step(2), signal(), watch);
    expect(pidOf(edit)).toBe(pid);
    expect(edit.candidate?.revision).toBe('2:2');
    expect(await readFile(log, 'utf8')).toBe('start 1\nend 1\nstart 2\nend 2\n');
    await proxy.watching?.(false);
    expect(alive(pid)).toBe(false);
    await proxy.dispose();
  });

  it('returns at once for the base whose program the startup generation left in the runtime', async () => {
    const log = path.join(temporary, 'prime-retained-log');
    const proxy = primable({ log, retain: true });
    // The startup buildOnce, before any watch: served by the long-lived runtime.
    const startup = await proxy.compile({ ...request(1), mode: 'development' }, signal(), {
      lifetime: 'generation',
    });
    const revision = startup.candidate!.revision;
    await proxy.watching?.(true);
    expect(await proxy.prime!(warmUp(2, 'ok', revision), signal())).toEqual({
      status: 'primed',
      revision,
    });
    // The warm-up compiled nothing; the first edit is served by the same runtime.
    expect(await readFile(log, 'utf8')).toBe('start 1\nend 1\n');
    const edit = await proxy.compile(step(3, 'ok', revision), signal(), watch);
    expect(pidOf(edit)).toBe(pidOf(startup));
    // A warm-up for another base compiles.
    expect(await proxy.prime!(warmUp(4, 'ok', 'other'), signal())).toMatchObject({
      status: 'primed',
    });
    expect(await readFile(log, 'utf8')).toBe('start 1\nend 1\nstart 3\nend 3\nstart 4\nend 4\n');
    await proxy.watching?.(false);
    await proxy.dispose();
  });

  it('has no hook without the persistent runtime or when disabled, and skips when not watching, busy, without a retained program or a previous snapshot', async () => {
    // No hook at all without the persistent runtime or with priming turned off.
    expect(primable({}, { persistent: false }).prime).toBeUndefined();
    expect(primable({}, { persistent: { prime: false } }).prime).toBeUndefined();
    expect(typeof primable({}, { persistent: { prime: true } }).prime).toBe('function');

    const marker = path.join(temporary, 'prime-busy');
    const proxy = primable({ marker });
    expect(await proxy.prime!(warmUp(1), signal())).toMatchObject({ reason: 'not watching' });
    await proxy.watching?.(true);
    const controller = new AbortController();
    const active = proxy.compile(step(2, 'cooperative'), controller.signal, watch);
    await waitFor(marker);
    expect(await proxy.prime!(warmUp(3), signal())).toMatchObject({ reason: 'busy' });
    controller.abort();
    await active;
    const previous = process.env['NGDOC_INCREMENTAL_SKIP'];
    process.env['NGDOC_INCREMENTAL_SKIP'] = 'off';
    try {
      expect(await proxy.prime!(warmUp(4), signal())).toMatchObject({
        reason: 'retained program disabled',
      });
    } finally {
      if (previous === undefined) delete process.env['NGDOC_INCREMENTAL_SKIP'];
      else process.env['NGDOC_INCREMENTAL_SKIP'] = previous;
    }
    expect(await proxy.prime!({ ...warmUp(5), mode: 'production' }, signal())).toMatchObject({
      reason: 'not a development request with a previous snapshot',
    });
    const { previous: _previous, ...withoutPrevious } = warmUp(6);
    expect(await proxy.prime!(withoutPrevious, signal())).toMatchObject({ status: 'skipped' });
    const aborted = new AbortController();
    aborted.abort();
    expect(await proxy.prime!(warmUp(7), aborted.signal)).toEqual({ status: 'aborted' });
    expect(
      await proxy.prime!(
        { ...warmUp(8), changes: [{ kind: 'update', path: '/x', execute() {} } as never] },
        signal(),
      ),
    ).toMatchObject({ status: 'failed', code: 'WORKER_INPUT' });
    await proxy.dispose();
    expect(await proxy.prime!(warmUp(9), signal())).toMatchObject({ reason: 'not watching' });

    const reference = primable({ incrementalReuse: false });
    await reference.watching?.(true);
    expect(await reference.prime!(warmUp(1), signal())).toMatchObject({
      reason: 'retained program disabled',
    });
    await reference.dispose();
  });

  it('yields to a real compile through the cooperative abort, without counting against the queue limit', async () => {
    const announce = path.join(temporary, 'prime-yield-announce');
    const marker = path.join(temporary, 'prime-yield');
    const proxy = primable(
      { announce, marker },
      { maxPendingRequests: 1, persistent: { abortGraceMs: 1000 } },
    );
    await proxy.watching?.(true);
    const priming = proxy.prime!(warmUp(1, 'cooperative'), signal());
    await waitFor(marker);
    const pid = await running(announce);
    const started = Date.now();
    const edit = await proxy.compile(step(2), signal(), watch);
    expect(await priming).toEqual({ status: 'aborted' });
    expect(Date.now() - started).toBeLessThan(1000);
    // The warm runtime survived the cooperative abort and served the edit.
    expect(pidOf(edit)).toBe(pid);
    expect(edit.diagnostics).toEqual([]);
    await proxy.dispose();
  });

  it('kills a warm-up that ignores the abort after the grace; the superseding compile runs cold', async () => {
    const announce = path.join(temporary, 'prime-kill-announce');
    const marker = path.join(temporary, 'prime-kill');
    const proxy = primable({ announce, marker }, { persistent: { abortGraceMs: 150 } });
    await proxy.watching?.(true);
    const priming = proxy.prime!(warmUp(1, 'loop'), signal());
    await waitFor(marker);
    const pid = await running(announce);
    const edit = await proxy.compile(step(2), signal(), watch);
    expect(await priming).toEqual({ status: 'aborted' });
    expect(alive(pid)).toBe(false);
    expect(edit.candidate?.revision).toBe('2:1');
    expect(pidOf(edit)).not.toBe(pid);
    await proxy.dispose();
  });

  it('is aborted by its signal, the watch stopping and dispose', async () => {
    const marker = path.join(temporary, 'prime-stop');
    const announce = path.join(temporary, 'prime-stop-announce');
    const proxy = primable({ marker, announce });
    await proxy.watching?.(true);
    const controller = new AbortController();
    const bySignal = proxy.prime!(warmUp(1, 'cooperative'), controller.signal);
    await waitFor(marker);
    controller.abort();
    expect(await bySignal).toEqual({ status: 'aborted' });
    await rm(marker);
    const byStop = proxy.prime!(warmUp(2, 'cooperative'), signal());
    await waitFor(marker);
    const pid = await running(announce);
    await proxy.watching?.(false);
    expect(await byStop).toEqual({ status: 'aborted' });
    for (let attempt = 0; attempt < 200 && alive(pid); attempt++)
      await new Promise((resolve) => setTimeout(resolve, 10));
    expect(alive(pid)).toBe(false);
    await rm(marker);
    await proxy.watching?.(true);
    const byDispose = proxy.prime!(warmUp(3, 'cooperative'), signal());
    await waitFor(marker);
    await proxy.dispose();
    expect(await byDispose).toEqual({ status: 'aborted' });
  });

  it('reports a warm-up without a usable candidate as failed', async () => {
    const proxy = primable();
    await proxy.watching?.(true);
    expect(await proxy.prime!(warmUp(1, 'throw'), signal())).toMatchObject({
      status: 'failed',
      code: 'WORKER_COMPILE',
      message: 'compile failed',
    });
    expect(await proxy.prime!(warmUp(2, 'nocandidate'), signal())).toMatchObject({
      status: 'failed',
      code: 'WORKER_PRIME_NO_CANDIDATE',
    });
    expect(await proxy.prime!(warmUp(3, 'error'), signal())).toMatchObject({
      status: 'failed',
      code: 'FIXTURE_ERROR',
      message: 'fixture error',
    });
    // The runtime survived every one of them.
    expect((await proxy.compile(step(4), signal(), watch)).diagnostics).toEqual([]);
    await proxy.dispose();
  });
});

describe('persistent worker host-realm isolation', () => {
  const watch = { lifetime: 'watch' as const };
  const step = (generation: number, name: string): CompilationRequest => ({
    ...request(generation),
    mode: 'development',
    changes: [{ kind: 'update', path: `/${name}` }],
  });
  const observed = (result: { whyRebuilt: Array<{ ownerId: string; reason: string }> }) =>
    Object.fromEntries(result.whyRebuilt.map((item) => [item.ownerId, item.reason]));
  const pidOf = (result: { candidate?: { projectId: string } }) =>
    Number(result.candidate?.projectId);
  const gone = async (pid: number, attempts = 400) => {
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        process.kill(pid, 0);
      } catch {
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    return false;
  };

  it('re-reads user files loaded by a runtime-computed require after an edit, like a one-shot runtime', async () => {
    const user = await mkdtemp(path.join(temporary, 'user-'));
    const json = path.join(user, 'keywords.json');
    const cjs = path.join(user, 'extra.cjs');
    const pkg = path.join(user, 'node_modules', 'counter', 'index.js');
    await mkdir(path.dirname(pkg), { recursive: true });
    // A package module stays cached (its identity may be shared); it counts its evaluations.
    await writeFile(
      pkg,
      'module.exports = globalThis.__ngdocCounter = (globalThis.__ngdocCounter ?? 0) + 1;',
    );
    const factoryOptions = { pid: true, load: [json, cjs, pkg] };
    const persistent = service(factoryOptions, { compileTimeoutMs: 5000 });
    const oneShot = service(factoryOptions, { compileTimeoutMs: 5000, persistent: false });
    try {
      const pids = new Set<number>();
      for (const [generation, version] of [
        [1, 'v1'],
        [2, 'v2'],
        [3, 'v3'],
      ] as const) {
        await writeFile(json, JSON.stringify({ JsonKw: `/json-${version}` }));
        await writeFile(cjs, `module.exports = ${JSON.stringify(version)};`);
        const kept = await persistent.compile(step(generation, 'load'), signal(), watch);
        const fresh = await oneShot.compile(step(generation, 'load'), signal(), watch);
        pids.add(pidOf(kept));
        expect(observed(kept)).toEqual(observed(fresh));
        expect(observed(kept)).toEqual({
          'keywords.json': JSON.stringify({ JsonKw: `/json-${version}` }),
          'extra.cjs': JSON.stringify(version),
          'index.js': '1',
        });
      }
      expect(pids.size).toBe(1);
    } finally {
      await Promise.all([persistent.dispose(), oneShot.dispose()]);
    }
  });

  it('replaces the runtime after a generation that required a user ES module, which cannot be evicted', async () => {
    const user = await mkdtemp(path.join(temporary, 'esm-'));
    const esm = path.join(user, 'values.mjs');
    const proxy = service({ pid: true, load: [esm] }, { compileTimeoutMs: 5000 });
    try {
      await writeFile(esm, 'export default "v1";');
      const first = await proxy.compile(step(1, 'load'), signal(), watch);
      await writeFile(esm, 'export default "v2";');
      const second = await proxy.compile(step(2, 'load'), signal(), watch);
      expect([observed(first)['values.mjs'], observed(second)['values.mjs']]).toEqual([
        '"v1"',
        '"v2"',
      ]);
      expect(pidOf(second)).not.toBe(pidOf(first));
      expect(await gone(pidOf(first))).toBe(true);
    } finally {
      await proxy.dispose();
    }
  });

  it('removes process listeners, restores umask/cwd/env and applies the host env and cwd per generation', async () => {
    const proxy = service({ pid: true }, { compileTimeoutMs: 5000 });
    const previous = process.env['NGDOC_TEST_HOST'];
    const cwd = process.cwd();
    try {
      process.env['NGDOC_TEST_HOST'] = 'host-a';
      const first = await proxy.compile(step(1, 'leak'), signal(), watch);
      process.env['NGDOC_TEST_HOST'] = 'host-b';
      process.chdir(temporary);
      const second = await proxy.compile(step(2, 'leak'), signal(), watch);
      const hostCwd = process.cwd();
      process.chdir(cwd);
      expect(pidOf(second)).toBe(pidOf(first));
      const a = JSON.parse(observed(first)['state']);
      const b = JSON.parse(observed(second)['state']);
      expect({ exit: b.exit, signal: b.signal, umask: b.umask }).toEqual({
        exit: a.exit,
        signal: a.signal,
        umask: a.umask,
      });
      expect([a.host, b.host]).toEqual(['host-a', 'host-b']);
      expect([a.cwd, b.cwd]).toEqual([cwd, hostCwd]);
      // A result that cannot cross the port is still a failure reply of a live runtime.
      expect((await proxy.compile(step(3, 'function'), signal(), watch)).diagnostics[0].code).toBe(
        'WORKER_COMPILE',
      );
      expect(pidOf(await proxy.compile(step(4, 'ok'), signal(), watch))).toBe(pidOf(first));
    } finally {
      process.chdir(cwd);
      if (previous === undefined) delete process.env['NGDOC_TEST_HOST'];
      else process.env['NGDOC_TEST_HOST'] = previous;
      await proxy.dispose();
    }
  });

  it.each(['idle', 'midcompile'])(
    'exits when its host dies (%s, with a leftover host-realm interval)',
    async (mode) => {
      const host = path.join(temporary, 'orphan-host.mjs');
      await writeFile(
        host,
        `import { createWorkerCompilationService } from ${JSON.stringify(pathToFileURL(path.join(temporary, 'index.js')).href)};
      const service = createWorkerCompilationService({ moduleUrl: process.argv[2], workerEntryUrl: new URL(process.argv[3]), factoryOptions: { pid: true } });
      const context = { lifetime: 'watch' };
      const change = (name) => ({ generation: 1, mode: 'development', changes: [{ kind: 'update', path: '/' + name }] });
      const first = await service.compile(change('interval'), new AbortController().signal, context);
      if (process.argv[4] === 'midcompile') void service.compile(change('hang'), new AbortController().signal, context);
      process.stdout.write(first.candidate.projectId + '\\n');
      setInterval(() => {}, 1000);`,
      );
      const child = spawn(process.execPath, [host, moduleUrl.href, workerEntryUrl.href, mode], {
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      const pid = await new Promise<number>((resolve, reject) => {
        child.stdout!.once('data', (data) => resolve(Number(String(data).trim())));
        child.once('exit', () => reject(new Error('host exited early')));
      });
      try {
        await new Promise((resolve) => setTimeout(resolve, 200));
        child.kill('SIGKILL');
        expect(await gone(pid)).toBe(true);
      } finally {
        try {
          process.kill(pid, 'SIGKILL');
        } catch {
          /* already gone */
        }
      }
    },
  );

  it('ends the runtime after watch generations still queued when the watch stops', async () => {
    const marker = path.join(temporary, 'queued-stop');
    const proxy = service({ pid: true, marker }, { compileTimeoutMs: 5000 });
    try {
      await proxy.watching?.(true);
      const controller = new AbortController();
      const running = proxy.compile(step(1, 'cooperative'), controller.signal, watch);
      await waitFor(marker);
      const queued = proxy.compile(step(2, 'ok'), signal(), watch);
      const stopped = proxy.watching?.(false);
      controller.abort();
      await running;
      await stopped;
      const last = await queued;
      expect(last.candidate?.revision).toBe('2:2');
      expect(await gone(pidOf(last))).toBe(true);
    } finally {
      await proxy.dispose();
    }
  });
});

describe('delta transport', () => {
  const deltaContext: CompilationContext = { lifetime: 'watch', delta: true };
  const artifact = (id: string, body: string, big = id === 'a' ? 'x' : 'y') => ({
    id,
    revision: id + body,
    body,
    meta: { big: big.repeat(64) },
  });
  const base = (): ArtifactSnapshot =>
    ({
      projectId: 'test',
      revision: 'a0|b0',
      artifacts: [artifact('a', '0'), artifact('b', '0')],
      globalKeywords: [],
      remoteKeywords: [],
    }) as unknown as ArtifactSnapshot;
  const edit = (
    generation: number,
    previous: ArtifactSnapshot | undefined,
    ...paths: string[]
  ) => ({
    generation,
    mode: 'development' as const,
    changes: paths.map((item) => ({ kind: 'update' as const, path: `/${item}` })),
    ...(previous ? { previous } : {}),
  });
  const used = (result: { whyRebuilt: Array<{ ownerId: string; reason: string }> }) =>
    result.whyRebuilt.find((item) => item.ownerId === 'previous')?.reason;

  it('resyncs once, then sends only changes, returns only changed artifacts and promotes on acknowledgement', async () => {
    const proxy = service({ snapshot: true }, { compileTimeoutMs: 5000 });
    expect(typeof proxy.acknowledge).toBe('function');
    const snapshot0 = base();
    const first = await proxy.compile(edit(1, snapshot0, 'touch:a:1'), signal(), deltaContext);
    expect(used(first)).toBe('a0|b0');
    expect(first.candidate?.revision).toBe('a1|b0');
    // The unchanged artifact is the caller's own object; the result equals the full candidate.
    expect(first.candidate?.artifacts[1]).toBe(snapshot0.artifacts[1]);
    expect(first.candidate).toEqual(
      normalized({
        ...snapshot0,
        revision: 'a1|b0',
        artifacts: [{ ...artifact('a', '1') }, artifact('b', '0')],
        frozen: false,
      }),
    );
    expect(proxy.transport()).toMatchObject({ deltas: 1, snapshotResyncs: 1, promotions: 0 });
    proxy.acknowledge!({ generation: 1, revision: 'a1|b0', status: 'committed' });
    // The next generation for the committed candidate sends no snapshot: the runtime promotes.
    const second = await proxy.compile(
      edit(2, first.candidate, 'touch:b:2', 'add:c:3'),
      signal(),
      deltaContext,
    );
    expect(used(second)).toBe('a1|b0');
    expect(second.candidate?.revision).toBe('a1|b2|c3');
    expect(second.candidate?.artifacts[0]).toBe(first.candidate?.artifacts[0]);
    expect(proxy.transport()).toMatchObject({ deltas: 2, snapshotResyncs: 1, promotions: 1 });
    // A discarded candidate is not promoted: the runtime still compiles from its committed base.
    proxy.acknowledge!({ generation: 2, revision: 'a1|b2|c3', status: 'discarded' });
    const third = await proxy.compile(edit(3, first.candidate, 'remove:a'), signal(), deltaContext);
    expect(used(third)).toBe('a1|b0');
    expect(third.candidate?.artifacts.map((item) => item.id)).toEqual(['b']);
    // An acknowledgement for a revision the runtime does not hold as working changes nothing.
    proxy.acknowledge!({ generation: 3, revision: 'unknown', status: 'committed' });
    // Another base (for example after a production build) is a resync with that snapshot.
    const other = {
      ...base(),
      revision: 'other',
      artifacts: [artifact('a', '9')],
    } as unknown as ArtifactSnapshot;
    const fourth = await proxy.compile(edit(4, other, 'touch:a:8'), signal(), deltaContext);
    expect(used(fourth)).toBe('other');
    expect(proxy.transport()).toMatchObject({
      deltas: 4,
      snapshotResyncs: 2,
      promotions: 1,
      fallbacks: 0,
    });
    // No previous snapshot at all: an empty base, no resync; a result without a candidate.
    const cold = await proxy.compile(edit(5, undefined), signal(), deltaContext);
    expect(cold.candidate?.revision).toBe('a0|b0');
    expect(used(await proxy.compile(edit(6, other, 'none'), signal(), deltaContext))).toBe('other');
    const stats = proxy.transport();
    expect(stats.sentCharacters).toBeGreaterThan(0);
    expect(stats.receivedCharacters).toBeGreaterThan(0);
    // The context the compiler sees is only the lifetime.
    expect(fourth.whyRebuilt.find((item) => item.ownerId === 'context')?.reason).toBe(
      JSON.stringify({ lifetime: 'watch' }),
    );
    await proxy.dispose();
    proxy.acknowledge!({ generation: 7, revision: 'x', status: 'committed' });
  });

  it('primes as the first resync, and keeps full transport without the delta flag, with delta off, or one-shot', async () => {
    const primed = service({ snapshot: true }, { compileTimeoutMs: 5000 });
    await primed.watching?.(true);
    const snapshot0 = base();
    expect(await primed.prime!(edit(1, snapshot0), signal())).toEqual({
      status: 'primed',
      revision: 'a0|b0',
    });
    const edited = await primed.compile(edit(2, snapshot0, 'touch:a:1'), signal(), deltaContext);
    expect(used(edited)).toBe('a0|b0');
    expect(primed.transport()).toMatchObject({ snapshotResyncs: 1, deltas: 1 });
    // A watch generation without the flag uses the full transport; it drops the retained state.
    const plain = await primed.compile(edit(3, snapshot0, 'touch:b:1'), signal(), {
      lifetime: 'watch',
    });
    expect(plain.candidate?.artifacts[0]).not.toBe(snapshot0.artifacts[0]);
    const again = await primed.compile(edit(4, snapshot0, 'touch:b:2'), signal(), deltaContext);
    expect(used(again)).toBe('a0|b0');
    expect(primed.transport()).toMatchObject({ snapshotResyncs: 2, deltas: 2 });
    await primed.dispose();
    for (const options of [{ persistent: { delta: false } }, { persistent: false }] as const) {
      const off = service({ snapshot: true }, { compileTimeoutMs: 5000, ...options });
      expect(off.acknowledge).toBeUndefined();
      const result = await off.compile(edit(1, snapshot0, 'touch:a:1'), signal(), deltaContext);
      expect(result.candidate?.artifacts[1]).not.toBe(snapshot0.artifacts[1]);
      expect(result.candidate?.artifacts[1]).toEqual(snapshot0.artifacts[1]);
      expect(off.transport()).toMatchObject({ deltas: 0, snapshotResyncs: 0 });
      await off.dispose();
    }
    const offPrime = service({ snapshot: true }, { persistent: { delta: false } });
    await offPrime.watching?.(true);
    expect((await offPrime.prime!(edit(1, snapshot0), signal())).status).toBe('primed');
    await offPrime.dispose();
    // A non-JSON caller snapshot fails the job where the resync would send it.
    const input = service({ snapshot: true });
    const bad = { ...base(), artifacts: [{ id: 'a', revision: 'a0', execute() {} }] };
    expect(
      (await input.compile(edit(1, bad as never, 'touch:a:1'), signal(), deltaContext))
        .diagnostics[0].code,
    ).toBe('WORKER_INPUT');
    expect((await input.compile(null as never, signal(), deltaContext)).diagnostics[0].code).toBe(
      'WORKER_INPUT',
    );
    await input.dispose();
  });

  it('verify mode freezes retained snapshots, checks every rebuilt candidate, and exposes in-place mutation', async () => {
    const proxy = service(
      { snapshot: true },
      { compileTimeoutMs: 5000, persistent: { delta: 'verify' } },
    );
    const snapshot0 = base();
    const first = await proxy.compile(edit(1, snapshot0, 'touch:a:1'), signal(), deltaContext);
    expect(Object.isFrozen(first.candidate)).toBe(true);
    expect(Object.isFrozen(first.candidate?.artifacts[0])).toBe(true);
    expect((first.candidate as unknown as { frozen: boolean }).frozen).toBe(true);
    proxy.acknowledge!({ generation: 1, revision: first.candidate!.revision, status: 'committed' });
    // A compiler that changes the (retained) previous snapshot in place throws in verify mode.
    const mutated = await proxy.compile(edit(2, first.candidate, 'mutate'), signal(), deltaContext);
    expect(mutated.diagnostics[0].code).toBe('WORKER_COMPILE');
    expect(proxy.transport()).toMatchObject({ deltas: 1, mismatches: 0, promotions: 1 });
    await proxy.dispose();
  });

  it('falls back to a resync, then to a full result, when the runtime disagrees; a second disagreement replaces it', async () => {
    const log = path.join(temporary, 'delta-fallback');
    const fake = await fixture(
      'delta-fallback-entry',
      `import { appendFileSync } from 'node:fs';
      let base = null;
      let committed = null;
      process.once('message', () => {
        process.channel.ref();
        process.on('message', (text) => {
          const message = JSON.parse(text);
          const path = message.request?.changes?.[0]?.path ?? '';
          appendFileSync(${JSON.stringify(log)}, JSON.stringify({ pid: process.pid, type: message.type, base: message.base ?? null, snapshot: !!message.snapshot, full: !!message.full, promote: message.promote ?? null }) + '\\n');
          const state = () => ({ base, committed, working: null });
          if (message.type === 'resync') {
            base = message.base;
            committed = message.snapshot && message.snapshot.revision !== 'unconfirmed' ? message.snapshot.revision : null;
            const answer = () => process.send(JSON.stringify({ type: 'resynced', base, state: state() }));
            // A snapshot resync slower than the startup deadline.
            if (message.snapshot?.revision === 'slow') return setTimeout(answer, 1500);
            return answer();
          }
          const reply = (value) => process.send(JSON.stringify({ id: message.id, state: state(), ...value }));
          const candidate = { projectId: 'test', revision: 'r1', artifacts: [], globalKeywords: [], remoteKeywords: [] };
          const result = { dependencies: [], diagnostics: [], whyRebuilt: [] };
          if (path === '/resync-required') return reply({ type: 'failure', code: 'WORKER_RESYNC_REQUIRED', message: 'no base' });
          if (path === '/resync-once' && !message.full && !globalThis.once) { globalThis.once = true; return reply({ type: 'failure', code: 'WORKER_BASE_MISMATCH', message: 'mismatch' }); }
          if (path === '/bad-delta' && !message.full) return reply({ type: 'result', result, delta: { base: 'wrong', keys: [], set: {}, artifacts: [] } });
          if (path === '/bad-delta-always') return reply({ type: 'result', result, delta: { base: 'wrong', keys: [], set: {}, artifacts: [] } });
          if (path === '/mismatch') return reply({ type: 'result', result, delta: { base: message.base, keys: ['projectId', 'revision', 'artifacts', 'globalKeywords', 'remoteKeywords'], set: { projectId: 'test', revision: 'r1', globalKeywords: [], remoteKeywords: [] }, artifacts: [] }, full: { ...candidate, revision: 'r1', extra: 1 } });
          if (path === '/bad-result') return reply({ type: 'result', result: {} });
          // An idle report above the budget while the runtime is still busy.
          if (path === '/idle-busy') process.send(JSON.stringify({ type: 'idle', rss: 1e15 }));
          // A rebuilt candidate equal in value but not in key order to the full one.
          if (path === '/reordered') return reply({ type: 'result', result, delta: { base: message.base, keys: ['projectId', 'revision', 'artifacts', 'globalKeywords', 'remoteKeywords'], set: { projectId: 'test', revision: 'r1', globalKeywords: [], remoteKeywords: [] }, artifacts: [] }, full: { revision: 'r1', projectId: 'test', artifacts: [], globalKeywords: [], remoteKeywords: [] } });
          if (path === '/fail') return reply({ type: 'failure', message: 'compile failed' });
          return reply({ type: 'result', result: { ...result, candidate } });
        });
        process.send(JSON.stringify({ type: 'ready', base: null, delta: true }));
      });`,
    );
    const lines = async () =>
      (await readFile(log, 'utf8'))
        .trim()
        .split('\n')
        .map(
          (line) =>
            JSON.parse(line) as { pid: number; type: string; full: boolean; snapshot: boolean },
        );
    const proxy = service({}, { workerEntryUrl: fake, compileTimeoutMs: 5000 });
    const run = (name: string, generation = 1) =>
      proxy.compile(edit(generation, base(), name), signal(), deltaContext);
    // Base mismatch once: resync with the snapshot, then the retry succeeds.
    expect((await run('resync-once')).candidate?.revision).toBe('r1');
    expect(proxy.transport()).toMatchObject({ fallbacks: 1, snapshotResyncs: 2 });
    // A delta that does not apply: resync, then a full candidate.
    expect((await run('bad-delta')).candidate?.revision).toBe('r1');
    const history = await lines();
    expect(history.at(-1)).toMatchObject({ type: 'compile', full: true });
    expect(history.at(-2)).toMatchObject({ type: 'resync', snapshot: true });
    expect(proxy.transport()).toMatchObject({ fallbacks: 2 });
    // Compile failures and malformed results.
    expect((await run('fail')).diagnostics[0].code).toBe('WORKER_COMPILE');
    const pid = history.at(-1)!.pid;
    expect((await run('bad-result')).diagnostics[0].code).toBe('WORKER_PROTOCOL');
    await vi.waitFor(() => expect(() => process.kill(pid, 0)).toThrow(), { timeout: 5000 });
    // Twice without the base, or a delta that never applies: the runtime is replaced.
    expect((await run('resync-required')).diagnostics[0].code).toBe('WORKER_PROTOCOL');
    expect((await run('bad-delta-always')).diagnostics[0].code).toBe('WORKER_PROTOCOL');
    await proxy.dispose();
    // A runtime that does not confirm the retained snapshot on resync is replaced.
    const unconfirmed = service({}, { workerEntryUrl: fake, compileTimeoutMs: 5000 });
    expect(
      (
        await unconfirmed.compile(
          edit(1, { ...base(), revision: 'unconfirmed' }, 'ok'),
          signal(),
          deltaContext,
        )
      ).diagnostics[0].code,
    ).toBe('WORKER_PROTOCOL');
    await unconfirmed.dispose();
    // verify mode: a rebuilt candidate that differs from the full one is replaced by it.
    const verified = service(
      {},
      { workerEntryUrl: fake, compileTimeoutMs: 5000, persistent: { delta: 'verify' } },
    );
    const checked = await verified.compile(edit(1, base(), 'mismatch'), signal(), deltaContext);
    expect(checked.candidate).toMatchObject({ revision: 'r1', extra: 1 });
    expect(Object.isFrozen(checked.candidate)).toBe(true);
    // A replaced delta is not counted as a delta.
    expect(verified.transport()).toMatchObject({ mismatches: 1, deltas: 0 });
    // After a mismatch the next compile resyncs again.
    await verified.compile(edit(2, base(), 'ok'), signal(), deltaContext);
    expect(verified.transport().snapshotResyncs).toBe(2);
    // Key-order exact: equal values in another key order are a mismatch too.
    const reordered = await verified.compile(edit(3, base(), 'reordered'), signal(), deltaContext);
    expect(Object.keys(reordered.candidate!)[0]).toBe('revision');
    expect(verified.transport()).toMatchObject({ mismatches: 2, deltas: 0 });
    await verified.dispose();
    // A snapshot resync runs under the compile deadline, not the startup deadline.
    const slow = service(
      {},
      { workerEntryUrl: fake, startupTimeoutMs: 1000, compileTimeoutMs: 5000 },
    );
    const slowed = await slow.compile(
      edit(1, { ...base(), revision: 'slow' }, 'ok'),
      signal(),
      deltaContext,
    );
    expect(slowed.candidate?.revision).toBe('r1');
    await slow.dispose();
    // An idle report above the budget that arrives while the runtime is busy replaces the runtime
    // as soon as that job resolves, not at the start of the next one.
    const busy = service({}, { workerEntryUrl: fake, compileTimeoutMs: 5000 });
    const before = (await lines()).length;
    await busy.compile(edit(1, base(), 'idle-busy'), signal(), deltaContext);
    const retiredPid = (await lines()).slice(before)[0].pid;
    await vi.waitFor(() => expect(() => process.kill(retiredPid, 0)).toThrow(), { timeout: 5000 });
    await busy.compile(edit(2, base(), 'ok'), signal(), deltaContext);
    const pids = (await lines()).slice(before).map((line) => line.pid);
    expect(pids[0]).not.toBe(pids.at(-1));
    expect(busy.transport().idleRss).toBe(1e15);
    await busy.dispose();
  });

  it('serves the retained base only to the very snapshot object it was built from', async () => {
    // The compiler keeps the previous snapshot's global keywords; the snapshot revision does not
    // cover them. A same-revision snapshot with other keywords (for example from a production
    // build) must be resynced, so the compiler sees it, exactly as with the full transport.
    const sequence = async (options: Partial<WorkerCompilationOptions>) => {
      const proxy = service({ snapshot: true }, { compileTimeoutMs: 5000, ...options });
      const snapshot0 = {
        ...base(),
        globalKeywords: [{ key: 'K1' }],
      } as unknown as ArtifactSnapshot;
      const first = await proxy.compile(edit(1, snapshot0, 'touch:a:1'), signal(), deltaContext);
      proxy.acknowledge?.({
        generation: 1,
        revision: first.candidate!.revision,
        status: 'committed',
      });
      const production = {
        ...structuredClone(first.candidate!),
        globalKeywords: [{ key: 'K2' }],
      } as ArtifactSnapshot;
      expect(production.revision).toBe(first.candidate!.revision);
      const second = await proxy.compile(edit(2, production, 'touch:a:2'), signal(), deltaContext);
      // A plain same-object follow-up still promotes without a resync.
      proxy.acknowledge?.({
        generation: 2,
        revision: second.candidate!.revision,
        status: 'committed',
      });
      const third = await proxy.compile(
        edit(3, second.candidate, 'touch:b:3'),
        signal(),
        deltaContext,
      );
      const statistics = proxy.transport();
      await proxy.dispose();
      return {
        second: normalized(second.candidate),
        third: normalized(third.candidate),
        statistics,
      };
    };
    const delta = await sequence({});
    const full = await sequence({ persistent: { delta: false } });
    expect(delta.second).toEqual(full.second);
    expect(delta.second?.globalKeywords).toEqual([{ key: 'K2' }]);
    expect(JSON.stringify(delta.third)).toBe(JSON.stringify(full.third));
    expect(delta.statistics).toMatchObject({ snapshotResyncs: 2, promotions: 1, deltas: 3 });
  });

  it('keeps a session consistent when a generation is superseded during a resync or during the retry', async () => {
    const log = path.join(temporary, 'delta-abort');
    const fake = await fixture(
      'delta-abort-entry',
      `import { appendFileSync } from 'node:fs';
      let base = null;
      let committed = null;
      let mismatchOnce = true;
      process.once('message', () => {
        process.channel.ref();
        process.on('message', (text) => {
          const message = JSON.parse(text);
          const path = message.request?.changes?.[0]?.path ?? '';
          appendFileSync(${JSON.stringify(log)}, JSON.stringify({ type: message.type, generation: message.request?.generation ?? null, path }) + '\\n');
          const state = () => ({ base, committed, working: null });
          if (message.type === 'resync') {
            base = message.base;
            committed = message.snapshot ? message.snapshot.revision : null;
            // Every snapshot resync is slow, so a change can land while it runs.
            return setTimeout(() => process.send(JSON.stringify({ type: 'resynced', base, state: state() })), message.snapshot ? 400 : 0);
          }
          if (message.type !== 'compile') return;
          if (path === '/retry.md' && mismatchOnce) {
            mismatchOnce = false;
            return process.send(JSON.stringify({ id: message.id, state: state(), type: 'failure', code: 'WORKER_BASE_MISMATCH', message: 'mismatch' }));
          }
          const candidate = { projectId: 'test', revision: 'r' + message.request.generation, artifacts: [], globalKeywords: [], remoteKeywords: [] };
          process.send(JSON.stringify({ id: message.id, state: state(), type: 'result', result: { candidate, dependencies: [], diagnostics: [], whyRebuilt: [] } }));
        });
        process.send(JSON.stringify({ type: 'ready', base: null, delta: true }));
      });`,
    );
    const entries = async () =>
      (await readFile(log, 'utf8').catch(() => ''))
        .trim()
        .split('\n')
        .filter(Boolean)
        .map(
          (line) => JSON.parse(line) as { type: string; generation: number | null; path: string },
        );
    const manifests: number[] = [];
    const session = createBuildSession(
      {
        compiler: service({}, { workerEntryUrl: fake, compileTimeoutMs: 5000 }),
        committer: {
          async commit(request: CommitRequest) {
            manifests.push(request.generation);
            return {
              status: 'committed',
              manifest: {
                schemaVersion: 1,
                projectId: request.candidate.projectId,
                generation: request.generation,
                revision: request.candidate.revision,
                files: [],
              },
              written: [],
              removed: [],
              diagnostics: [],
            };
          },
          async dispose() {},
        },
      },
      { batchDelayMs: 0 },
    );
    let emit!: (changes: Array<{ kind: 'update'; path: string }>) => unknown;
    const results: Array<{ generation: number; status: string; snapshot?: { revision: string } }> =
      [];
    const watch = await session.watch(
      {
        async subscribe(listener: (events: FileChange[]) => unknown) {
          emit = listener;
          return { dispose: async () => {} };
        },
      },
      (event) => {
        if (event.kind === 'result') results.push(event.result as never);
      },
    );
    const initial = await watch.initial;
    expect(initial.diagnostics).toEqual([]);
    expect(initial.status).toBe('success');
    const resyncs = async () => (await entries()).filter((entry) => entry.type === 'resync').length;
    // 1. The next generation must resync (the runtime returned full results, nothing retained);
    //    a change during that resync supersedes it.
    let seen = await resyncs();
    emit([{ kind: 'update', path: '/a.md' }]);
    await vi.waitFor(async () => expect(await resyncs()).toBe(seen + 1), {
      timeout: 5000,
      interval: 5,
    });
    emit([{ kind: 'update', path: '/b.md' }]);
    await vi.waitFor(() => expect(results.some((result) => result.generation === 3)).toBe(true), {
      timeout: 10_000,
    });
    // 2. The runtime disagrees once; a change during the retry's resync supersedes the retry.
    seen = await resyncs();
    emit([{ kind: 'update', path: '/retry.md' }]);
    await vi.waitFor(async () => expect(await resyncs()).toBe(seen + 2), {
      timeout: 5000,
      interval: 5,
    });
    emit([{ kind: 'update', path: '/c.md' }]);
    await vi.waitFor(() => expect(results.some((result) => result.generation === 5)).toBe(true), {
      timeout: 10_000,
    });
    expect(results.map((result) => [result.generation, result.status])).toEqual([
      [1, 'success'],
      [2, 'cancelled'],
      [3, 'success'],
      [4, 'cancelled'],
      [5, 'success'],
    ]);
    // The superseded generations never compiled or committed; the session stayed consistent.
    const compiled = (await entries())
      .filter((entry) => entry.type === 'compile')
      .map((entry) => entry.generation);
    expect(compiled).toEqual([1, 3, 4, 5]);
    expect(manifests).toEqual([1, 3, 5]);
    expect(results.at(-1)?.snapshot?.revision).toBe('r5');
    await watch.dispose();
    await session.dispose();
  });

  it('uses the full transport with a runtime that does not announce the delta transport', async () => {
    const log = path.join(temporary, 'delta-legacy');
    const legacy = await fixture(
      'delta-legacy-entry',
      `import { appendFileSync } from 'node:fs';
      process.once('message', () => {
        process.channel.ref();
        process.on('message', (text) => {
          const message = JSON.parse(text);
          appendFileSync(${JSON.stringify(log)}, JSON.stringify({ type: message.type, previous: message.request?.previous?.revision ?? null, generation: message.request?.generation ?? null }) + '\\n');
          if (message.type === 'resync') return process.send(JSON.stringify({ type: 'resynced', base: message.base }));
          process.send(JSON.stringify({ type: 'result', id: message.id, result: ${JSON.stringify(good)} }));
        });
        process.send(JSON.stringify({ type: 'ready', base: null }));
      });`,
    );
    const proxy = service({}, { workerEntryUrl: legacy, compileTimeoutMs: 5000 });
    expect(
      (await proxy.compile(edit(1, base(), 'ok'), signal(), deltaContext)).candidate?.revision,
    ).toBe('1');
    expect(
      (await proxy.compile(edit(2, undefined, 'ok'), signal(), deltaContext)).candidate?.revision,
    ).toBe('1');
    const bad = { ...base(), artifacts: [{ id: 'a', revision: 'a0', execute() {} }] };
    expect(
      (await proxy.compile(edit(3, bad as never, 'ok'), signal(), deltaContext)).diagnostics[0]
        .code,
    ).toBe('WORKER_INPUT');
    const lines = (await readFile(log, 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(lines).toEqual([
      { type: 'resync', previous: null, generation: null },
      { type: 'compile', previous: 'a0|b0', generation: 1 },
      { type: 'resync', previous: null, generation: null },
      { type: 'compile', previous: null, generation: 2 },
    ]);
    expect(proxy.transport()).toMatchObject({ deltas: 0, snapshotResyncs: 0 });
    await proxy.dispose();
  });

  it('keeps committed and working snapshots apart in the actual entry process', async () => {
    const child = fork(workerEntryUrl, [], {
      execArgv: [],
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    });
    const replies: Array<Record<string, unknown>> = [];
    const exited = new Promise<number | null>((resolve) => child.once('exit', resolve));
    const idles: Array<Record<string, unknown>> = [];
    child.on('message', (reply) => {
      const decoded = decode(reply);
      (decoded['type'] === 'idle' ? idles : replies).push(decoded);
    });
    const reply = async (count: number) => {
      for (let attempt = 0; attempt < 300 && replies.length < count; attempt++)
        await new Promise((resolve) => setTimeout(resolve, 10));
      return replies[count - 1];
    };
    let count = 0;
    const exchange = async (message: unknown) => {
      child.send(typeof message === 'string' ? message : encode(message));
      return reply(++count);
    };
    const compile = (id: number, fields: Record<string, unknown>, ...paths: string[]) => {
      const { previous: _previous, ...request } = edit(id, undefined, ...paths);
      return exchange({ type: 'compile', id, delta: true, request, ...fields });
    };
    child.send(
      encode({ moduleUrl: moduleUrl.href, factoryOptions: { snapshot: true }, persistent: true }),
    );
    expect(await reply(++count)).toEqual({ type: 'ready', base: null, delta: true });
    const snapshot0 = base();
    // A resync snapshot must be for its base.
    expect(await exchange({ type: 'resync', base: 'x', snapshot: snapshot0 })).toMatchObject({
      type: 'failure',
    });
    expect(await exchange({ type: 'resync', base: 'a0|b0', snapshot: snapshot0 })).toEqual({
      type: 'resynced',
      base: 'a0|b0',
      state: { base: 'a0|b0', committed: 'a0|b0', working: null },
    });
    // A delta compile replies with the delta, keeps the candidate as working, the base as committed.
    const first = await compile(1, { base: 'a0|b0', retained: true }, 'touch:a:1');
    expect(first).toMatchObject({
      type: 'result',
      id: 1,
      state: { base: 'a0|b0', committed: 'a0|b0', working: 'a1|b0' },
    });
    expect(first['result']).not.toHaveProperty('candidate');
    const delta = first['delta'] as { artifacts: unknown[] };
    expect(delta.artifacts).toEqual([
      {
        id: 'a',
        revision: 'a1',
        keys: ['id', 'revision', 'body', 'meta'],
        set: { revision: 'a1', body: '1' },
      },
      { id: 'b', revision: 'b0' },
    ]);
    const patched = applySnapshotDelta(snapshot0, delta);
    expect(patched.artifacts[1]).toBe(snapshot0.artifacts[1]);
    // Promotion only for the working revision; a wrong one leaves the base and fails the compile.
    expect(
      await compile(2, { base: 'a1|b0', retained: true, promote: 'nope' }, 'touch:b:1'),
    ).toMatchObject({
      type: 'failure',
      code: 'WORKER_BASE_MISMATCH',
      state: { base: 'a0|b0', committed: 'a0|b0', working: null },
    });
    await compile(3, { base: 'a0|b0', retained: true }, 'touch:a:1');
    const promoted = await compile(
      4,
      { base: 'a1|b0', retained: true, promote: 'a1|b0' },
      'touch:b:1',
    );
    expect(promoted).toMatchObject({
      state: { base: 'a1|b0', committed: 'a1|b0', working: 'a1|b1' },
    });
    // `full: true` returns the whole candidate and keeps no working state; so does a result
    // without a candidate, a warm-up, and a compile that fails.
    const full = await compile(5, { base: 'a1|b0', retained: true, full: true }, 'touch:b:2');
    expect(full).toMatchObject({ state: { committed: 'a1|b0', working: null } });
    expect((full['result'] as { candidate: ArtifactSnapshot }).candidate.revision).toBe('a1|b2');
    expect(await compile(6, { base: 'a1|b0', retained: true }, 'none')).toMatchObject({
      state: { working: null },
    });
    expect(await compile(7, { base: 'a1|b0', retained: true, prime: true })).toMatchObject({
      primed: { revision: 'a1|b0' },
      state: { committed: 'a1|b0', working: null },
    });
    expect(await compile(8, { base: 'a1|b0', retained: true }, 'function')).toMatchObject({
      type: 'failure',
      state: { working: null },
    });
    expect(
      await compile(9, { base: 'a1|b0', retained: true, verify: true }, 'touch:a:2'),
    ).toMatchObject({
      full: { revision: 'a2|b0' },
      state: { working: 'a2|b0' },
    });
    // A large delta keeps only the working snapshot; promoting it needs nothing else.
    const adds = Array.from({ length: FIELD_LEVEL_LIMIT + 1 }, (_, index) => `add:n${index}:1`);
    const large = await compile(21, { base: 'a1|b0', retained: true }, ...adds);
    expect(large).toMatchObject({ state: { base: 'a1|b0', committed: null } });
    const working = (large['state'] as { working: string }).working;
    expect(
      await compile(22, { base: working, retained: true, promote: working }, 'none'),
    ).toMatchObject({ type: 'result', state: { base: working, committed: working } });
    expect(
      await exchange({
        type: 'resync',
        base: 'a1|b0',
        snapshot: {
          ...base(),
          revision: 'a1|b0',
          artifacts: [artifact('a', '1'), artifact('b', '0')],
        },
      }),
    ).toMatchObject({
      state: { committed: 'a1|b0' },
    });
    // A candidate no delta can describe (a duplicate id) is sent whole, and nothing is kept.
    const whole = await compile(20, { base: 'a1|b0', retained: true }, 'duplicate');
    expect(whole).toMatchObject({ type: 'result', state: { committed: 'a1|b0', working: null } });
    expect(whole).not.toHaveProperty('delta');
    expect((whole['result'] as { candidate: ArtifactSnapshot }).candidate.artifacts).toHaveLength(
      3,
    );
    // A delta compile needs its base retained, and a request object.
    expect(await compile(10, { base: 'a1|b0', retained: true, request: 'bad' })).toMatchObject({
      code: 'WORKER_RESYNC_REQUIRED',
    });
    expect(await exchange({ type: 'resync', base: 'plain' })).toMatchObject({
      state: { committed: null },
    });
    expect(await compile(11, { base: 'plain', retained: true }, 'touch:a:1')).toMatchObject({
      code: 'WORKER_RESYNC_REQUIRED',
    });
    // A compile without the delta flag drops everything retained.
    expect(
      await exchange({ type: 'resync', base: 'a0|b0', snapshot: snapshot0, verify: true }),
    ).toMatchObject({ state: { committed: 'a0|b0' } });
    expect(
      await exchange({
        type: 'compile',
        id: 12,
        base: 'a0|b0',
        request: edit(12, snapshot0, 'touch:a:1'),
      }),
    ).toMatchObject({
      type: 'result',
      state: { committed: null, working: null },
    });
    // Every reply was followed by an idle report of the resident set after the collection.
    expect(idles.length).toBeGreaterThan(5);
    expect(idles.every((item) => typeof item['rss'] === 'number')).toBe(true);
    child.send(encode({ type: 'dispose' }));
    expect(await exited).toBe(0);
  });
});

describe('JSON protocol validation', () => {
  it('round trips JSON and rejects non-JSON values/messages/results', () => {
    expect(decode(encode({ null: null, list: ['a', 1, true], empty: undefined }))).toEqual({
      null: null,
      list: ['a', 1, true],
    });
    expect(encode(Object.create(null))).toBe('{}');
    for (const item of [
      undefined,
      () => 1,
      Symbol('x'),
      1n,
      Infinity,
      new Map(),
      new Date(),
      {
        toJSON() {
          return 'hidden';
        },
      },
    ])
      expect(() => encode(item)).toThrow();
    const cycle: unknown[] = [];
    cycle.push(cycle);
    expect(() => encode(cycle)).toThrow();
    for (const item of [1, '{}oops', 'null', '[]']) expect(() => decode(item)).toThrow();
    for (const item of [
      null,
      1,
      {},
      { ...good, dependencies: null },
      { ...good, diagnostics: null },
      { ...good, whyRebuilt: null },
      { ...good, candidate: null },
      { ...good, candidate: 1 },
      { ...good, candidate: {} },
    ])
      expect(() => resultFrom(item)).toThrow();
    expect(
      resultFrom({ dependencies: [], diagnostics: [], whyRebuilt: [] }).candidate,
    ).toBeUndefined();
    expect(errorMessage('failure')).toBe('failure');
  });

  it('transports the non-physical dependency kinds as plain JSON, in a result and a delta', () => {
    const dependencies = [
      { kind: 'semantic-closure', scopeId: 'program', key: 'unit', digest: 'c' },
      { kind: 'evaluated', entryId: 'entry', digest: 'e' },
    ];
    const result = { dependencies, diagnostics: [], whyRebuilt: [] };
    expect(resultFrom(decode(encode(result)))).toEqual(result);
    const snapshot = (revision: string, artifactDependencies: unknown[]) =>
      ({
        projectId: 'p',
        revision,
        artifacts: [{ id: 'a', revision, dependencies: artifactDependencies }],
        globalKeywords: [],
        remoteKeywords: [],
      }) as unknown as ArtifactSnapshot;
    const base = snapshot('s0', []);
    const candidate = snapshot('s1', dependencies);
    const delta = decode(encode(snapshotDelta(base, candidate)));
    expect(applySnapshotDelta(base, delta as never)).toEqual(candidate);
  });

  it('encodes a candidate as a delta of its base and rebuilds it exactly', () => {
    const artifact = (id: string, revision: string, extra: Record<string, unknown> = {}) => ({
      id,
      identity: { projectId: 'p', entryId: id, role: 'page-shell' },
      revision,
      dependencies: [{ kind: 'content', path: `/${id}`, digest: revision }],
      outputs: [{ path: `${id}.mjs`, content: revision.repeat(8) }],
      ...extra,
    });
    const base = normalized({
      configuration: { digest: 'c0' },
      projectId: 'p',
      revision: 's0',
      artifacts: [
        artifact('a', 'a0'),
        artifact('b', 'b0'),
        artifact('gone', 'g0'),
        artifact('agg', 'x0'),
      ],
      globalKeywords: [{ key: 'k' }],
      remoteKeywords: [],
      removed: true,
    }) as unknown as ArtifactSnapshot;
    const candidate = {
      configuration: { digest: 'c1' },
      projectId: 'p',
      revision: 's1',
      artifacts: [
        artifact('agg', 'x1', {
          dependencies: base.artifacts[3].dependencies.map((item) => ({ ...item })),
          note: undefined,
        }),
        artifact('b', 'b0'),
        artifact('a', 'a1'),
        artifact('new', 'n1'),
      ],
      globalKeywords: [{ key: 'k' }],
      remoteKeywords: [],
      added: undefined,
    } as unknown as ArtifactSnapshot;
    const delta = snapshotDelta(base, candidate);
    const text = encode(delta);
    const rebuilt = applySnapshotDelta(base, JSON.parse(text));
    expect(rebuilt).toEqual(normalized(candidate));
    expect(JSON.stringify(rebuilt)).toBe(JSON.stringify(candidate));
    expect(rebuilt.artifacts[1]).toBe(base.artifacts[1]);
    // Field level: the aggregate's unchanged dependencies are the base's, not re-sent.
    expect(rebuilt.artifacts[0].dependencies).toBe(base.artifacts[3].dependencies);
    // Every non-artifact top-level key is sent in full, even when equal to the base.
    expect(Object.keys(delta.set)).toEqual([
      'configuration',
      'projectId',
      'revision',
      'globalKeywords',
      'remoteKeywords',
    ]);
    expect(delta.keys).toEqual([
      'configuration',
      'projectId',
      'revision',
      'artifacts',
      'globalKeywords',
      'remoteKeywords',
    ]);
    // The unchanged artifact is not re-sent.
    expect(text).not.toContain(base.artifacts[1].outputs[0].content);
    // Without a base, and above the field-level limit, artifacts are sent whole.
    expect(applySnapshotDelta(undefined, normalized(snapshotDelta(undefined, candidate)))).toEqual(
      normalized(candidate),
    );
    const many = {
      ...candidate,
      artifacts: Array.from({ length: FIELD_LEVEL_LIMIT + 1 }, (_, index) =>
        artifact(`m${index}`, `r${index}`),
      ),
    } as unknown as ArtifactSnapshot;
    const manyBase = normalized({
      ...base,
      artifacts: many.artifacts.map((item) => ({ ...item, revision: 'old' })),
    });
    const whole = snapshotDelta(manyBase, many);
    expect((whole.artifacts[0] as { set: object }).set).toEqual(normalized(many.artifacts[0]));
    expect(applySnapshotDelta(manyBase, normalized(whole))).toEqual(normalized(many));
  });

  it('rejects a delta that does not fit its base', () => {
    const base = normalized({
      projectId: 'p',
      revision: 's0',
      artifacts: [{ id: 'a', revision: 'a0', body: 1 }],
      globalKeywords: [],
      remoteKeywords: [],
    }) as unknown as ArtifactSnapshot;
    const good = {
      base: 's0',
      keys: ['projectId', 'revision', 'artifacts'],
      set: { revision: 's1' },
      artifacts: [{ id: 'a', revision: 'a0' }],
    };
    expect(applySnapshotDelta(base, good).revision).toBe('s1');
    const cases: unknown[] = [
      null,
      [],
      { ...good, base: 'other' },
      { ...good, artifacts: {} },
      { ...good, artifacts: [null] },
      { ...good, artifacts: [{ id: 1, revision: 'a0' }] },
      {
        ...good,
        artifacts: [
          { id: 'a', revision: 'a0' },
          { id: 'a', revision: 'a0' },
        ],
      },
      { ...good, artifacts: [{ id: 'a', revision: 'a9' }] },
      { ...good, artifacts: [{ id: 'z', revision: 'z0' }] },
      { ...good, artifacts: [{ id: 'a', revision: 'a1', keys: 'id', set: {} }] },
      { ...good, artifacts: [{ id: 'a', revision: 'a1', keys: [1], set: {} }] },
      { ...good, artifacts: [{ id: 'a', revision: 'a1', keys: ['id'], set: [] }] },
      { ...good, artifacts: [{ id: 'a', revision: 'a1', keys: ['id', 'revision'], set: {} }] },
      {
        ...good,
        artifacts: [
          {
            id: 'z',
            revision: 'z1',
            keys: ['id', 'revision', 'body'],
            set: { id: 'z', revision: 'z1' },
          },
        ],
      },
      { ...good, artifacts: [{ id: 'a', revision: 'a1', keys: ['id', 'id'], set: { id: 'a' } }] },
      { ...good, artifacts: [{ id: 'a', revision: 'a1', keys: ['__proto__'], set: {} }] },
      { ...good, keys: ['projectId', 'revision'] },
      { ...good, keys: ['projectId', 'revision', 'artifacts', 'missing'] },
      { ...good, keys: ['revision', 'artifacts'], set: { revision: 's1' } },
      { ...good, set: { revision: 1 } },
    ];
    for (const item of cases)
      expect(() => applySnapshotDelta(base, item), JSON.stringify(item)).toThrow();
    const duplicated = { ...base, artifacts: [base.artifacts[0], base.artifacts[0]] };
    expect(() => applySnapshotDelta(duplicated, good)).toThrow('duplicate base artifact');
    const value = { a: { b: [1, { c: 2 }] }, d: null };
    expect(deepFreeze(value)).toBe(value);
    expect(Object.isFrozen(value.a.b[1])).toBe(true);
    expect(deepFreeze(value)).toBe(value);
    expect(deepFreeze(3)).toBe(3);
  });
});
