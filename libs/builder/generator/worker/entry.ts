import { createRequire } from 'node:module';

import type {
  ArtifactSnapshot,
  CompilationContext,
  CompilationRequest,
  CompilationResult,
  CompilationService,
} from '../contracts';
import {
  applySnapshotDelta,
  createProgressChannel,
  createRuntimeRetention,
  decode,
  deepFreeze,
  encode,
  errorMessage,
  FIELD_LEVEL_LIMIT,
  resultFrom,
  snapshotDelta,
} from './protocol.js';

type Factory = (options: unknown) => CompilationService | Promise<CompilationService>;
/**
 * An optional export of the compilation module: the targeted rebuild's dry-run report of this
 * process (compiler/dry-run.ts). This runtime's stdio is not forwarded, so each new dry-run record
 * travels back with its compile's reply and the host reports it.
 */
type DryRunReport = () => { counters: { generations: number }; last?: unknown };

/** The dry-run report of the loaded compilation module, when it exports one. */
let dryRunReport: DryRunReport | undefined;

/**
 * The compilation module's render threads (compiler/index.ts), when it has them: a long-lived
 * runtime keeps them across its generations' services, and every runtime terminates them before it
 * exits (they would die with the process anyway; this waits until each has stopped).
 */
let renderThreads: { keep(keep: boolean): void; dispose(): Promise<void> } | undefined;

/** Terminates the render threads, then exits. */
function exit(): void {
  void (renderThreads?.dispose() ?? Promise.resolve())
    .catch(() => undefined)
    .finally(() => process.exit(0));
}

const send = (message: string): void => {
  process.send!(message);
};

/**
 * The compile's progress channel when the host asked for one (`progress: true`; never for a
 * warm-up): the compiler's updates become `progress` messages for this compile id, sent before its
 * reply. The sink is attached non-enumerable, like the retention slot, so it never serialises.
 */
function progressFor(
  job: Record<string, unknown>,
  id: unknown,
  context: CompilationContext,
): { close(): void } | undefined {
  if (job['progress'] !== true || job['prime'] === true) return undefined;
  const channel = createProgressChannel((update) => send(encode({ type: 'progress', id, update })));
  Object.defineProperty(context, 'progress', { value: channel.sink, enumerable: false });
  return channel;
}

async function load(options: Record<string, unknown>): Promise<Factory> {
  if (typeof options['moduleUrl'] !== 'string') throw new Error('Missing compilation module URL');
  const module: {
    createCompilationService?: Factory;
    targetedDryRun?: DryRunReport;
    keepRenderThreads?: (keep: boolean) => void;
    disposeRenderThreads?: () => Promise<void>;
  } = await import(options['moduleUrl']);
  if (typeof module.createCompilationService !== 'function') {
    throw new Error('Compilation module must export createCompilationService(options)');
  }
  if (typeof module.targetedDryRun === 'function') dryRunReport = module.targetedDryRun;
  if (
    typeof module.keepRenderThreads === 'function' &&
    typeof module.disposeRenderThreads === 'function'
  )
    renderThreads = { keep: module.keepRenderThreads, dispose: module.disposeRenderThreads };
  return module.createCompilationService;
}

async function create(factory: Factory, options: unknown): Promise<CompilationService> {
  const service = await factory(options);
  if (!service || typeof service.compile !== 'function' || typeof service.dispose !== 'function') {
    throw new Error('Factory must return a CompilationService');
  }
  return service;
}

/** One-shot runtime: one service, one compile, then the parent kills this process. */
async function start(workerData: unknown): Promise<void> {
  const options = decode(workerData);
  const factory = await load(options);
  const service = await create(factory, options['factoryOptions']);
  process.once('message', async (message: unknown) => {
    let id: unknown;
    try {
      const job = decode(message);
      id = job['id'];
      if (job['type'] !== 'compile' || !Number.isSafeInteger(id))
        throw new Error('Invalid compile message');
      let result;
      // A one-shot runtime dies after this reply: nothing it could retain would be reused.
      const context: CompilationContext = { lifetime: 'generation' };
      const progress = progressFor(job, id, context);
      try {
        result = resultFrom(
          await service.compile(
            job['request'] as CompilationRequest,
            new AbortController().signal,
            context,
          ),
        );
      } finally {
        progress?.close();
        await service.dispose();
        // Nothing of a one-shot compile outlives it (the process ends anyway: a failure is moot).
        await renderThreads?.dispose().catch(() => undefined);
      }
      send(encode({ type: 'result', id, result }));
    } catch (error) {
      send(encode({ type: 'failure', id, message: errorMessage(error) }));
    }
  });
  send(encode({ type: 'ready' }));
}

/** The summary a warm-up compile replies with: the retained candidate revision, or why none. */
function primedReply(result: CompilationResult): Record<string, unknown> {
  const error = result.diagnostics.find((item) => item.severity === 'error');
  return result.candidate && !error
    ? { revision: result.candidate.revision }
    : {
        code: error?.code ?? 'WORKER_PRIME_NO_CANDIDATE',
        message: error?.message ?? 'The warm-up compile returned no candidate',
      };
}

/** The host's CommonJS module cache, shared with the `require` of every discovery vm scope. */
const moduleCache = createRequire(import.meta.url).cache;
const PACKAGE_MODULE = /[\\/]node_modules[\\/]/;

function replaceEnv(env: Record<string, unknown>): void {
  for (const key of Object.keys(process.env)) if (!(key in env)) delete process.env[key];
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === 'string' && process.env[key] !== value) process.env[key] = value;
  }
}

function changeDirectory(directory: unknown): void {
  try {
    if (typeof directory === 'string' && process.cwd() !== directory) process.chdir(directory);
  } catch {
    /* A removed directory cannot be entered; the generation still runs. */
  }
}

/**
 * Host-realm state that a generation's user modules can reach (through `process` and the native
 * `require` of their vm scopes), made per-generation again, as it is in a one-shot runtime:
 *
 * - `process.env` and the working directory are set to the host's values sent with the compile
 *   (a one-shot runtime inherits them at fork), and restored afterwards, with `umask` and
 *   `exitCode`;
 * - process event listeners added during the generation are removed (they would also retain
 *   the generation's vm contexts);
 * - modules first loaded into the CommonJS cache during the generation, outside `node_modules`,
 *   are evicted, so a user file loaded by a runtime-computed `require` (for example a JSON
 *   keyword list) is read again next generation. Package modules stay: their identity may be
 *   shared with the compiler. An ES module loaded this way (`require(esm)`) cannot be evicted from
 *   the ESM loader; `stale` then asks the host to replace this runtime before the next generation.
 *
 * Mutations of shared builtin modules or globals cannot be undone here; the recycle bound of the
 * host (`maxGenerations`) remains the backstop for those.
 */
function isolate(host: unknown): () => { stale: boolean } {
  if (host !== null && typeof host === 'object' && !Array.isArray(host)) {
    const { env, cwd } = host as Record<string, unknown>;
    if (env !== null && typeof env === 'object' && !Array.isArray(env)) {
      replaceEnv(env as Record<string, unknown>);
    }
    changeDirectory(cwd);
  }
  const env = { ...process.env };
  const cwd = process.cwd();
  const umask = process.umask();
  const listeners = new Map(
    process.eventNames().map((name) => [name, new Set(process.rawListeners(name))]),
  );
  const modules = new Set(Object.keys(moduleCache));
  return () => {
    for (const name of process.eventNames()) {
      const before = listeners.get(name);
      for (const listener of process.rawListeners(name)) {
        if (!before?.has(listener)) {
          process.removeListener(name, listener as (...args: unknown[]) => void);
        }
      }
    }
    let stale = false;
    for (const key of Object.keys(moduleCache)) {
      if (modules.has(key) || PACKAGE_MODULE.test(key)) continue;
      if (Object.prototype.toString.call(moduleCache[key]?.exports) === '[object Module]') {
        stale = true;
      }
      delete moduleCache[key];
    }
    replaceEnv(env);
    changeDirectory(cwd);
    process.umask(umask);
    process.exitCode = undefined;
    return { stale };
  };
}

/** Whether `value` can be a retained snapshot for `base` (a resync payload). */
function snapshotFor(value: unknown, base: unknown): value is ArtifactSnapshot {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (value as ArtifactSnapshot).revision === base &&
    typeof (value as ArtifactSnapshot).projectId === 'string' &&
    Array.isArray((value as ArtifactSnapshot).artifacts)
  );
}

/** Appends raw JSON members to an encoded object (the delta is encoded once and parsed once). */
function withMembers(text: string, members: Record<string, string>): string {
  const extra = Object.entries(members)
    .map(([key, value]) => `,${JSON.stringify(key)}:${value}`)
    .join('');
  return extra ? `${text.slice(0, -1)}${extra}}` : text;
}

/**
 * Long-lived development runtime (see worker/index.ts). Messages: `resync` (adopt a base
 * revision, and with the delta transport the base snapshot itself), `compile` (for that base; with
 * `prime: true` a warm-up that replies only with the candidate revision), `abort` (cooperative
 * cancellation of the running compile) and `dispose` (exit once idle). Each compile creates and
 * disposes its own compilation service, so user-module evaluation scopes never outlive their
 * generation.
 *
 * Delta transport (`delta: true` compiles): the runtime keeps the *committed* snapshot for its base
 * (received by `resync`, or promoted) and, apart from it, the *working* snapshot of the last
 * candidate it returned. A delta compile takes its previous snapshot from the committed one
 * (`retained: true`) and replies with the candidate as a `SnapshotDelta` of it; the working
 * snapshot is rebuilt from that very delta (`applySnapshotDelta`), exactly as the host rebuilds its
 * candidate. The working snapshot becomes the committed one only when the host sends `promote`
 * (after the session acknowledged the commit); any other compile, resync or failure drops it. A
 * compile without `delta` drops both. Every reply reports `state` so the host always knows what is
 * retained.
 *
 * Retention slot: the runtime also owns the compiler's retention slot (`createRuntimeRetention`)
 * and hands it to every compile through its context. It follows the same messages: the entry a
 * delta compile offers for its candidate is the slot's working entry, committed only when `promote`
 * (or a resync to its revision) says the caller committed it; the committed entry survives a
 * discarded commit when its program was only read. Warm-ups, compiles without `delta` and
 * full-candidate retries commit their offer at once (`compile-end`).
 */
async function serve(workerData: unknown): Promise<void> {
  const options = decode(workerData);
  const factory = await load(options);
  // The render threads serve every generation of this runtime, until it is disposed or recycled.
  renderThreads?.keep(true);
  // Validate the factory once, as the one-shot runtime does before `ready`.
  await (await create(factory, options['factoryOptions'])).dispose();
  let base: string | null = null;
  let committed: ArtifactSnapshot | undefined;
  let working: ArtifactSnapshot | undefined;
  let running: { id: number; controller: AbortController } | undefined;
  let disposing = false;
  const retention = createRuntimeRetention();
  /**
   * The working snapshot of the last reply, built after that reply was sent: the host needs its
   * candidate at once, the runtime needs `working` only at the next compile.
   */
  let pending:
    | { base: ArtifactSnapshot | undefined; text: string; large: boolean; verify: boolean }
    | undefined;
  const state = () => ({
    base,
    committed: committed?.revision ?? null,
    working: working?.revision ?? null,
  });
  /** Builds the pending working snapshot exactly as the host rebuilt its candidate. */
  const settle = (): void => {
    const next = pending;
    pending = undefined;
    if (!next) return;
    try {
      working = applySnapshotDelta(next.base, JSON.parse(next.text));
      if (next.verify) deepFreeze(working);
    } catch {
      working = undefined;
    }
    // After a large delta (an API edit re-renders every page) the two snapshots share little:
    // keep only the working one. Its promotion needs nothing else; a discarded commit then costs
    // one resync instead of holding a second full snapshot until the next compile.
    if (next.large) committed = undefined;
  };
  const compile = async (job: Record<string, unknown>): Promise<void> => {
    const id = job['id'] as number;
    const controller = new AbortController();
    running = { id, controller };
    const release = isolate(job['host']);
    const request = job['request'] as CompilationRequest;
    const previous = request?.previous;
    const delta = job['delta'] === true && job['prime'] !== true && job['full'] !== true;
    let reply: Record<string, unknown>;
    const members: Record<string, string> = {};
    /**
     * The candidate as a delta of `previous`. `working` is rebuilt from the decoded delta after the
     * reply is sent (`settle`), exactly as the host rebuilds its candidate (JSON values only, equal
     * by construction). A candidate no delta can describe returns undefined: the reply then carries
     * the full candidate and nothing is kept.
     */
    const deltaOf = (
      base: ArtifactSnapshot | undefined,
      candidate: ArtifactSnapshot,
    ): string | undefined => {
      try {
        const delta = snapshotDelta(base, candidate);
        const encoded = encode(delta);
        // Checked now (assembly only, no parse), so that a delta the host cannot apply is never sent.
        applySnapshotDelta(base, delta);
        pending = {
          base,
          text: encoded,
          large: delta.artifacts.filter((entry) => 'keys' in entry).length > FIELD_LEVEL_LIMIT,
          verify: job['verify'] === true,
        };
        return encoded;
      } catch {
        return undefined;
      }
    };
    const dryRuns = dryRunReport?.().counters.generations ?? 0;
    try {
      const service = await create(factory, options['factoryOptions']);
      let result;
      let progress: { close(): void } | undefined;
      try {
        // This runtime serves the watch: its compiler may keep a program for the next generation,
        // in this runtime's slot. A delta candidate's program waits for the commit's
        // acknowledgement; no acknowledgement follows any other compile.
        const context: CompilationContext = { lifetime: 'watch' };
        Object.defineProperty(context, 'retention', {
          value: retention.serve(delta ? 'acknowledged' : 'compile-end'),
          enumerable: false,
        });
        progress = progressFor(job, id, context);
        result = resultFrom(await service.compile(request, controller.signal, context));
      } finally {
        progress?.close();
        await service.dispose();
      }
      if (job['prime'] === true) {
        // A warm-up (worker/index.ts `prime`): the candidate never leaves this runtime.
        reply = {
          type: 'result',
          id,
          result: { dependencies: [], diagnostics: [], whyRebuilt: [] },
          primed: primedReply(result),
        };
      } else {
        const { candidate, ...rest } = result;
        const text = delta && candidate ? deltaOf(previous, candidate) : undefined;
        if (text === undefined) {
          reply = { type: 'result', id, result };
        } else {
          if (job['verify'] === true) members['full'] = encode(candidate);
          members['delta'] = text;
          reply = { type: 'result', id, result: rest, working: candidate!.revision };
        }
        // Only when this compile ran the dry run (the targeted rebuild's `verify` mode).
        const dryRun = dryRunReport?.();
        if (dryRun && dryRun.counters.generations > dryRuns) reply['dryRun'] = dryRun.last;
      }
    } catch (error) {
      pending = undefined;
      reply = { type: 'failure', id, message: errorMessage(error) };
    }
    const { stale } = release();
    running = undefined;
    let message: string;
    // The state after `settle`: what the next compile will find.
    const { working: next, ...reported } = reply;
    reply = reported;
    const promised = () =>
      pending
        ? {
            base,
            committed: pending.large ? null : committed?.revision ?? null,
            working: next as string,
          }
        : state();
    try {
      message = withMembers(
        encode({
          ...reply,
          state: promised(),
          rss: process.memoryUsage().rss,
          ...(stale ? { recycle: true } : {}),
        }),
        members,
      );
    } catch (error) {
      pending = undefined;
      message = encode({ type: 'failure', id, message: errorMessage(error), state: state() });
    }
    process.send!(message, () => {
      if (disposing) return exit();
      settle();
      // A compile that is already running gets neither a full collection in its middle nor a
      // report of its mid-compile resident set; its own reply collects later.
      if (running) return;
      // Collect the finished generation's garbage (its TS program) while idle, not during the
      // next generation (exposed only in the long-lived runtime, --expose-gc), then report the
      // resident set that stays: the host's recycle budget is checked against it.
      (globalThis as { gc?: () => void }).gc?.();
      send(encode({ type: 'idle', rss: process.memoryUsage().rss }));
    });
  };
  process.on('message', (message: unknown) => {
    let job: Record<string, unknown>;
    try {
      job = decode(message);
    } catch (error) {
      send(encode({ type: 'failure', message: errorMessage(error) }));
      return;
    }
    const id = job['id'];
    if (job['type'] === 'abort') {
      if (running && running.id === id) running.controller.abort();
    } else if (job['type'] === 'dispose') {
      disposing = true;
      if (!running) return exit();
      running.controller.abort();
    } else if (
      job['type'] === 'resync' &&
      !running &&
      (job['base'] === null || typeof job['base'] === 'string') &&
      (job['snapshot'] === undefined || snapshotFor(job['snapshot'], job['base']))
    ) {
      pending = undefined;
      retention.resync(job['base']);
      base = job['base'];
      committed = job['snapshot'] as ArtifactSnapshot | undefined;
      if (committed && job['verify'] === true) deepFreeze(committed);
      working = undefined;
      send(encode({ type: 'resynced', base, state: state() }));
    } else if (job['type'] === 'compile' && Number.isSafeInteger(id) && !running) {
      settle();
      // Promotion on commit: only the candidate the host says was committed becomes the base.
      if (typeof job['promote'] === 'string' && working?.revision === job['promote']) {
        committed = working;
        base = job['promote'];
      }
      retention.promote(job['promote']);
      working = undefined;
      if (job['delta'] !== true) committed = undefined;
      if (job['base'] !== base) {
        send(
          encode({
            type: 'failure',
            id,
            code: 'WORKER_BASE_MISMATCH',
            message: `Compile base ${String(job['base'])} does not match the acknowledged base ${String(base)}`,
            state: state(),
          }),
        );
        return;
      }
      if (job['delta'] === true && job['retained'] === true) {
        const request = job['request'];
        if (
          !committed ||
          committed.revision !== base ||
          request === null ||
          typeof request !== 'object' ||
          Array.isArray(request)
        ) {
          send(
            encode({
              type: 'failure',
              id,
              code: 'WORKER_RESYNC_REQUIRED',
              message: `No retained snapshot for base ${String(base)}`,
              state: state(),
            }),
          );
          return;
        }
        (request as CompilationRequest).previous = committed;
      }
      if (job['prime'] === true && base !== null && retention.inspect().committed === base) {
        // A warm-up for a base whose program this runtime already retains (it compiled the
        // startup generation, worker/index.ts `servesStartup`): compiling again would only
        // replace that entry with an equal one.
        send(
          encode({
            type: 'result',
            id,
            result: { dependencies: [], diagnostics: [], whyRebuilt: [] },
            primed: { revision: base },
            state: state(),
            rss: process.memoryUsage().rss,
          }),
        );
        return;
      }
      void compile(job);
    } else {
      send(encode({ type: 'failure', id, message: `Invalid ${String(job['type'])} message` }));
    }
  });
  // `delta`: this runtime keeps committed/working snapshots (worker/index.ts falls back to the full
  // transport for a runtime that does not say so, for example an entry from an older package).
  send(encode({ type: 'ready', base, delta: true }));
}

process.once('message', (workerData: unknown) => {
  // A pending Promise alone does not keep Node alive after a once-listener is removed.
  process.channel!.ref();
  // The host is gone: stop at once, even mid-compile or with handles user code left behind.
  process.once('disconnect', () => process.exit(0));
  let persistent = false;
  try {
    persistent = decode(workerData)['persistent'] === true;
  } catch {
    /* start() reports the malformed startup message. */
  }
  void (persistent ? serve(workerData) : start(workerData)).catch((error: unknown) => {
    process.send!(encode({ type: 'failure', message: errorMessage(error) }));
  });
});
