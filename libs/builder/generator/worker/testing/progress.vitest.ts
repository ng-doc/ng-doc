import { build } from 'esbuild';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest';

import type {
  CompilationContext,
  CompilationProgressUpdate,
  CompilationRequest,
  JsonValue,
} from '../../contracts';
import { type WorkerCompilationOptions, createWorkerCompilationService } from '../index';
import {
  createProgressChannel,
  PROGRESS_INTERVAL_MS,
  ProgressRelay,
  progressUpdate,
} from '../protocol';

// Progress over the worker boundary: JSON `progress` messages, coalesced in the runtime, relayed by
// the host only for the job in flight, with the host's own `boot` and `transfer` phases. Nothing
// here may change a result.

let temporary: string;
let moduleUrl: URL;
let workerEntryUrl: URL;

beforeAll(async () => {
  temporary = await mkdtemp(path.join(tmpdir(), 'ngdoc-worker-progress-'));
  await writeFile(path.join(temporary, 'package.json'), '{"type":"module"}');
  await build({
    entryPoints: [
      path.resolve(import.meta.dirname, '../entry.ts'),
      path.resolve(import.meta.dirname, '../protocol.ts'),
    ],
    outdir: temporary,
    platform: 'node',
    format: 'esm',
    target: 'node24',
  });
  workerEntryUrl = pathToFileURL(path.join(temporary, 'entry.js'));
  const factory = path.join(temporary, 'factory.mjs');
  // A compiler that reports phases through `context.progress`, plus messages the host must drop:
  // one before `ready` (from the factory), one for a foreign compile id, and malformed updates.
  await writeFile(
    factory,
    `
    const send = (value) => process.send(typeof value === 'string' ? value : JSON.stringify(value));
    const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    let announced = false;
    export function createCompilationService(options) {
      // Once per process: the first factory call runs before the runtime is ready.
      if (!announced) send({ type: 'progress', id: 1, update: { phase: 'discovery', state: 'start' } });
      announced = true;
      return {
        async compile(request, signal, context) {
          const sink = context?.progress;
          const listed = Object.keys(context ?? {}).includes('progress');
          if (sink) {
            send({ type: 'progress', id: 987654, update: { phase: 'render', state: 'start' } });
            sink({ phase: 'bogus', state: 'start' });
            sink({ phase: 'render', state: 'advance', completed: -1 });
            sink({ phase: 'discovery', state: 'start' });
            sink({ phase: 'discovery', state: 'end' });
            sink({ phase: 'render', state: 'start', completed: 0, total: options.units });
            for (let unit = 1; unit <= options.units; unit++) {
              if (signal.aborted) throw new Error('aborted');
              sink({ phase: 'render', state: 'advance', completed: unit, reused: 0 });
              await pause(options.pauseMs);
            }
            sink({ phase: 'render', state: 'end', completed: options.units, total: options.units, reused: 0 });
            sink({ phase: 'persist', state: 'start' });
            sink({ phase: 'persist', state: 'end' });
          }
          return {
            dependencies: [],
            diagnostics: [],
            whyRebuilt: [],
            candidate: {
              projectId: 'p',
              revision: (sink ? 'progress' : 'none') + (listed ? '-listed' : '') + '-' + request.generation,
              artifacts: [],
              globalKeywords: [],
              remoteKeywords: [],
            },
          };
        },
        dispose: async () => {},
      };
    }
    `,
  );
  moduleUrl = pathToFileURL(factory);
}, 60_000);

afterAll(async () => {
  await rm(temporary, { recursive: true, force: true });
});

const services: Array<{ dispose(): Promise<void> }> = [];
afterEach(async () => {
  await Promise.all(services.splice(0).map((service) => service.dispose()));
});

/**
 *
 * @param factoryOptions
 * @param options
 */
function service(factoryOptions: JsonValue, options: Partial<WorkerCompilationOptions> = {}) {
  const created = createWorkerCompilationService({
    moduleUrl,
    workerEntryUrl,
    factoryOptions,
    startupTimeoutMs: 10_000,
    compileTimeoutMs: 20_000,
    ...options,
  });
  services.push(created);
  return created;
}

const request = (generation: number): CompilationRequest => ({
  generation,
  mode: 'development',
  changes: [],
});

/**
 *
 * @param lifetime
 * @param extra
 * @param sink
 */
function recording(
  lifetime: CompilationContext['lifetime'],
  extra: Partial<CompilationContext> = {},
  sink?: (update: CompilationProgressUpdate) => void,
) {
  const updates: CompilationProgressUpdate[] = [];
  const context: CompilationContext = { lifetime, ...extra };
  Object.defineProperty(context, 'progress', {
    value: sink ?? ((update: CompilationProgressUpdate) => updates.push(update)),
    enumerable: false,
  });
  return { updates, context };
}

const outline = (updates: CompilationProgressUpdate[]) =>
  updates
    .filter((update) => update.state !== 'advance')
    .map((update) => `${update.phase}:${update.state}`);

const PHASES = [
  'discovery:start',
  'discovery:end',
  'render:start',
  'render:end',
  'persist:start',
  'persist:end',
  'transfer:start',
  'transfer:end',
];

describe('worker progress transport', () => {
  test('a one-shot runtime relays coalesced updates between boot and transfer', async () => {
    const compiler = service({ units: 60, pauseMs: 5 });
    const { updates, context } = recording('generation');
    const started = performance.now();
    const result = await compiler.compile(request(1), new AbortController().signal, context);
    const elapsed = performance.now() - started;
    // The sink is attached non-enumerable in the runtime too.
    expect(result.candidate?.revision).toBe('progress-1');
    expect(outline(updates)).toEqual(['boot:start', 'boot:end', ...PHASES]);
    const advances = updates.filter((update) => update.state === 'advance');
    expect(advances.length).toBeGreaterThan(0);
    // At most one advance per interval, and never more than the loop's own count.
    expect(advances.length).toBeLessThanOrEqual(Math.ceil(elapsed / PROGRESS_INTERVAL_MS) + 1);
    expect(advances.length).toBeLessThan(60);
    const counts = advances.map((update) => update.completed!);
    expect([...counts].sort((a, b) => a - b)).toEqual(counts);
    expect(updates.find((update) => update.phase === 'render' && update.state === 'end')).toEqual({
      phase: 'render',
      state: 'end',
      completed: 60,
      total: 60,
      reused: 0,
    });
    // Without a sink the runtime is not asked for progress at all.
    const quiet = await compiler.compile(request(2), new AbortController().signal, {
      lifetime: 'generation',
    });
    expect(quiet.candidate?.revision).toBe('none-2');
  }, 60_000);

  test('the long-lived runtime boots once and relays both transports', async () => {
    const compiler = service({ units: 3, pauseMs: 1 }, { persistent: { prime: true } });
    await compiler.watching!(true);
    const first = recording('watch');
    expect(
      (await compiler.compile(request(1), new AbortController().signal, first.context)).candidate
        ?.revision,
    ).toBe('progress-1');
    // Prepared while watching: the runtime may have been ready before the first job came.
    expect(outline(first.updates).filter((item) => !item.startsWith('boot'))).toEqual(PHASES);
    const second = recording('watch', { delta: true });
    const delta = await compiler.compile(request(2), new AbortController().signal, second.context);
    expect(delta.candidate?.revision).toBe('progress-2');
    expect(outline(second.updates)).toEqual(PHASES);
    // A warm-up never asks for progress.
    const primed = await compiler.prime!(
      { ...request(3), previous: delta.candidate! },
      new AbortController().signal,
    );
    expect(primed).toEqual({ status: 'primed', revision: 'none-3' });
    await compiler.watching!(false);
  }, 60_000);

  test('a runtime that starts for the job reports its boot', async () => {
    const compiler = service({ units: 1, pauseMs: 1 }, { persistent: { prime: false } });
    const { updates, context } = recording('watch');
    await compiler.compile(request(1), new AbortController().signal, context);
    expect(outline(updates)).toEqual(['boot:start', 'boot:end', ...PHASES]);
  }, 60_000);

  test('a throwing consumer never changes the result', async () => {
    const compiler = service({ units: 5, pauseMs: 1 });
    const { context } = recording('generation', {}, () => {
      throw new Error('consumer failed');
    });
    const result = await compiler.compile(request(1), new AbortController().signal, context);
    expect(result.candidate?.revision).toBe('progress-1');
    expect(result.diagnostics).toEqual([]);
  }, 60_000);

  test('nothing is relayed once the job is aborted', async () => {
    const compiler = service({ units: 400, pauseMs: 5 }, { persistent: { abortGraceMs: 200 } });
    const controller = new AbortController();
    const after: CompilationProgressUpdate[] = [];
    const { context } = recording('watch', {}, (update) => {
      if (controller.signal.aborted) after.push(update);
      if (update.phase === 'render' && update.state === 'advance') controller.abort();
    });
    const result = await compiler.compile(request(1), controller.signal, context);
    expect(result.diagnostics[0]?.code).toBe('WORKER_ABORTED');
    await new Promise((resolve) => setTimeout(resolve, 3 * PROGRESS_INTERVAL_MS));
    expect(after).toEqual([]);
  }, 60_000);

  test('a delta retry reports its phases only when the first attempt reported none', async () => {
    // A runtime that refuses the first compile of `/mismatch` before compiling, and answers the
    // first compile of `/bad-delta` with phases and a delta that does not apply (the retry then
    // compiles again with a full candidate). Every compile message is logged.
    const log = path.join(temporary, 'retry.jsonl');
    const entry = path.join(temporary, 'retry-entry.mjs');
    await writeFile(
      entry,
      `import { appendFileSync } from 'node:fs';
      let base = null;
      const seen = new Set();
      process.once('message', () => {
        process.channel.ref();
        process.on('message', (text) => {
          const message = JSON.parse(text);
          const state = () => ({ base, committed: null, working: null });
          if (message.type === 'resync') {
            base = message.base;
            return process.send(JSON.stringify({ type: 'resynced', base, state: state() }));
          }
          const path = message.request.changes[0].path;
          appendFileSync(${JSON.stringify(log)}, JSON.stringify({ path, progress: !!message.progress, full: !!message.full }) + '\\n');
          const reply = (value) => process.send(JSON.stringify({ id: message.id, state: state(), ...value }));
          const first = !seen.has(path);
          seen.add(path);
          if (path === '/mismatch' && first)
            return reply({ type: 'failure', code: 'WORKER_BASE_MISMATCH', message: 'mismatch' });
          if (message.progress) {
            for (const update of [
              { phase: 'discovery', state: 'start' },
              { phase: 'persist', state: 'start' },
              { phase: 'persist', state: 'end' },
            ])
              process.send(JSON.stringify({ type: 'progress', id: message.id, update }));
          }
          const result = { dependencies: [], diagnostics: [], whyRebuilt: [] };
          if (path === '/bad-delta' && !message.full)
            return reply({ type: 'result', result, delta: { base: 'wrong', keys: [], set: {}, artifacts: [] } });
          const candidate = { projectId: 'p', revision: 'r-' + path.slice(1), artifacts: [], globalKeywords: [], remoteKeywords: [] };
          return reply({ type: 'result', result: { ...result, candidate } });
        });
        process.send(JSON.stringify({ type: 'ready', base: null, delta: true }));
      });`,
    );
    const compiler = service({}, { workerEntryUrl: pathToFileURL(entry) });
    const run = async (file: string) => {
      const { updates, context } = recording('watch', { delta: true });
      const result = await compiler.compile(
        { ...request(1), changes: [{ kind: 'update', path: file }] },
        new AbortController().signal,
        context,
      );
      return { result, updates };
    };
    const mismatch = await run('/mismatch');
    expect(mismatch.result.candidate?.revision).toBe('r-mismatch');
    expect(outline(mismatch.updates).filter((item) => !item.startsWith('boot'))).toEqual([
      'discovery:start',
      'persist:start',
      'persist:end',
      'transfer:start',
      'transfer:end',
    ]);
    const bad = await run('/bad-delta');
    expect(bad.result.candidate?.revision).toBe('r-bad-delta');
    // The phases are reported once, by the first attempt.
    expect(outline(bad.updates)).toEqual([
      'discovery:start',
      'persist:start',
      'persist:end',
      'transfer:start',
      'transfer:end',
    ]);
    const compiles = (await readFile(log, 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(compiles).toEqual([
      { path: '/mismatch', progress: true, full: false },
      { path: '/mismatch', progress: true, full: false },
      { path: '/bad-delta', progress: true, full: false },
      { path: '/bad-delta', progress: false, full: true },
    ]);
  }, 60_000);
});

describe('progress channel', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test('sends phase edges at once and coalesces advances, the latest winning', () => {
    vi.useFakeTimers();
    let clock = 0;
    const sent: CompilationProgressUpdate[] = [];
    const channel = createProgressChannel(
      (update) => sent.push(update),
      () => clock,
    );
    const advance = (completed: number) =>
      channel.sink({ phase: 'render', state: 'advance', completed });
    channel.sink({ phase: 'render', state: 'start', completed: 0, total: 10 });
    advance(1);
    clock = 10;
    advance(2);
    advance(3);
    expect(sent.map((update) => update.completed)).toEqual([0, 1]);
    clock = 100;
    vi.advanceTimersByTime(90);
    expect(sent.map((update) => update.completed)).toEqual([0, 1, 3]);
    clock = 150;
    advance(4);
    // The phase end makes the pending advance obsolete.
    channel.sink({ phase: 'render', state: 'end', completed: 10, total: 10 });
    vi.advanceTimersByTime(200);
    expect(sent.map((update) => [update.state, update.completed])).toEqual([
      ['start', 0],
      ['advance', 1],
      ['advance', 3],
      ['end', 10],
    ]);
    // A late interval sends at once.
    clock = 1_000;
    advance(5);
    expect(sent.at(-1)).toEqual({ phase: 'render', state: 'advance', completed: 5 });
    clock = 1_010;
    advance(6);
    channel.close();
    channel.sink({ phase: 'persist', state: 'start' });
    vi.advanceTimersByTime(500);
    expect(sent).toHaveLength(5);
  });

  test('a failing send never throws into the compiler', () => {
    const channel = createProgressChannel(() => {
      throw new Error('channel closed');
    });
    expect(() => channel.sink({ phase: 'plan', state: 'start' })).not.toThrow();
    expect(() => channel.sink({ phase: 'plan', state: 'advance', completed: 1 })).not.toThrow();
  });
});

describe('progress messages', () => {
  test('accepts only well-formed updates, field by field', () => {
    expect(
      progressUpdate({
        phase: 'render',
        state: 'advance',
        completed: 3,
        total: 9,
        reused: 1,
        pass: 'targeted',
        reason: 'x'.repeat(300),
        extra: 'dropped',
      }),
    ).toEqual({
      phase: 'render',
      state: 'advance',
      completed: 3,
      total: 9,
      reused: 1,
      pass: 'targeted',
      reason: 'x'.repeat(200),
    });
    expect(progressUpdate({ phase: 'boot', state: 'end' })).toEqual({
      phase: 'boot',
      state: 'end',
    });
    for (const bad of [
      null,
      [],
      'text',
      { phase: 'commit', state: 'start' },
      { phase: 'render', state: 'done' },
      { phase: 'render', state: 'start', completed: -1 },
      { phase: 'render', state: 'start', total: 1.5 },
      { phase: 'render', state: 'start', reused: '1' },
      { phase: 'render', state: 'start', pass: 'partial' },
      { phase: 'render', state: 'start', reason: 1 },
      { phase: 'render', state: 'advance', completed: 3, total: 2 },
      { phase: 'render', state: 'advance', completed: 2, reused: 3 },
    ])
      expect(progressUpdate(bad), JSON.stringify(bad)).toBeUndefined();
  });

  test('the relay adds the transfer after the last compiler phase and goes quiet after settling', () => {
    const received: CompilationProgressUpdate[] = [];
    const controller = new AbortController();
    const relay = new ProgressRelay((update) => received.push(update), controller.signal);
    relay.boot('start');
    relay.boot('end');
    relay.forward({ phase: 'transfer', state: 'start' });
    relay.forward({ phase: 'persist', state: 'start' });
    relay.forward({ phase: 'persist', state: 'end' });
    relay.forward({ phase: 'persist', state: 'end' });
    relay.settled();
    relay.forward({ phase: 'discovery', state: 'start' });
    expect(outline(received)).toEqual([
      'boot:start',
      'boot:end',
      'persist:start',
      'persist:end',
      'transfer:start',
      'persist:end',
      'transfer:end',
    ]);
    // A fall back to the full pass: its own `persist` end starts a new transfer.
    const restarted: CompilationProgressUpdate[] = [];
    const again = new ProgressRelay((update) => restarted.push(update), controller.signal);
    again.forward({ phase: 'persist', state: 'end', pass: 'targeted' });
    again.forward({ phase: 'describe', state: 'advance', pass: 'full' });
    again.forward({ phase: 'persist', state: 'end', pass: 'full' });
    again.forward({ phase: 'describe', state: 'start', pass: 'full' });
    again.forward({ phase: 'persist', state: 'end', pass: 'full' });
    again.settled();
    expect(outline(restarted)).toEqual([
      'persist:end',
      'transfer:start',
      'persist:end',
      'describe:start',
      'persist:end',
      'transfer:start',
      'transfer:end',
    ]);
    // A fast start: the restore phase that restored the candidate is the compiler's last; one
    // that did not (the start compiles) is followed by the other phases.
    const fast: CompilationProgressUpdate[] = [];
    const restoring = new ProgressRelay((update) => fast.push(update), controller.signal);
    restoring.forward({ phase: 'restore', state: 'start' });
    restoring.forward({ phase: 'restore', state: 'end', pass: 'restored' });
    restoring.settled();
    expect(outline(fast)).toEqual([
      'restore:start',
      'restore:end',
      'transfer:start',
      'transfer:end',
    ]);
    const declined: CompilationProgressUpdate[] = [];
    const compiling = new ProgressRelay((update) => declined.push(update), controller.signal);
    compiling.forward({ phase: 'restore', state: 'start' });
    compiling.forward({ phase: 'semantic', state: 'start', pass: 'full', reason: 'x changed' });
    expect(outline(declined)).toEqual(['restore:start', 'semantic:start']);
    const quiet: CompilationProgressUpdate[] = [];
    const aborted = new AbortController();
    aborted.abort();
    const stopped = new ProgressRelay((update) => quiet.push(update), aborted.signal);
    stopped.forward({ phase: 'discovery', state: 'start' });
    stopped.settled();
    expect(quiet).toEqual([]);
    const throwing = new ProgressRelay(() => {
      throw new Error('consumer failed');
    }, new AbortController().signal);
    expect(() => throwing.forward({ phase: 'persist', state: 'end' })).not.toThrow();
    expect(() => throwing.settled()).not.toThrow();
  });
});
