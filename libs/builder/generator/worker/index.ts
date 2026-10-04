import { type ChildProcess, fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import type {
  ArtifactSnapshot,
  CompilationAcknowledgement,
  CompilationContext,
  CompilationRequest,
  CompilationResult,
  CompilationService,
  JsonValue,
} from '../contracts';
import {
  applySnapshotDelta,
  decode,
  deepFreeze,
  encode,
  errorMessage,
  ProgressRelay,
  resultFrom,
} from './protocol.js';

/** Long-lived development runtime limits (see `createWorkerCompilationService`). */
export interface PersistentWorkerOptions {
  /** Cooperative abort grace before the runtime is SIGKILLed. Defaults to 1500 ms. */
  abortGraceMs?: number;
  /** An idle runtime that served this many generations is replaced. Defaults to 50. */
  maxGenerations?: number;
  /** An idle runtime whose resident set exceeds this many bytes is replaced. Defaults to 3 GiB. */
  maxRssBytes?: number;
  /**
   * Allow `prime`: a warm-up of the long-lived runtime at idle, so that its compiler already
   * retains a program when the first edit arrives. With it, a development generation before the
   * first watch (the startup buildOnce) also runs in that runtime, so the warm-up usually finds the
   * program there and compiles nothing. Defaults to true.
   */
  prime?: boolean;
  /**
   * Delta transport between the session and this runtime. Defaults to true. The runtime keeps the
   * committed snapshot of its base, so a request carries only its changes and base revision, and a
   * result returns only the changed artifacts (`SnapshotDelta`); the host rebuilds the complete
   * candidate against the caller's snapshot. The full snapshot crosses only on a resync (a fresh or
   * recycled runtime, or a base the runtime does not retain). A working candidate becomes the
   * runtime's base only after `acknowledge` reports its commit. `false` keeps the full transport.
   * `'verify'` also sends the full candidate and checks the rebuilt one against it (falling back to
   * it on any difference), and freezes retained snapshots so that an in-place mutation throws: for
   * tests and diagnosis only, it costs more than the full transport.
   */
  delta?: boolean | 'verify';
}

/** Counters of the delta transport (instrumentation and tests). */
export interface DeltaTransportStatistics {
  /** Results whose candidate was rebuilt from a delta. */
  deltas: number;
  /** Resyncs that sent the caller's full previous snapshot. */
  snapshotResyncs: number;
  /** Compiles that promoted the runtime's working snapshot (acknowledged commits). */
  promotions: number;
  /** Delta compiles retried with a resync (and, after an unusable delta, a full candidate). */
  fallbacks: number;
  /** `verify` mode: rebuilt candidates that differed from the full one. */
  mismatches: number;
  /** Characters of delta-mode messages sent (compile and resync) and of replies received. */
  sentCharacters: number;
  receivedCharacters: number;
  /** The last reply-time and idle (after the runtime's collection) resident set sizes, in bytes. */
  replyRss?: number;
  idleRss?: number;
}

/**
 * The targeted rebuild's report as the long-lived runtime returned it (see compiler/dry-run.ts):
 * the runtime's own output is not forwarded, so each compile returns its record with the reply. A
 * record with misses or a mismatch (`NGDOC_TARGETED_REBUILD=verify`) is reported as a
 * `COMPILATION_TARGETED_MISMATCH` process warning here.
 */
export interface TargetedDryRunStatistics {
  /** Compiles that returned a record / records with misses or a targeted-versus-full mismatch. */
  records: number;
  misses: number;
  /** The last record, as the compiler wrote it (JSON). */
  last?: unknown;
}

/** What a `prime` call did. It never carries a candidate. */
export type PrimeOutcome =
  /** The runtime compiled the request; `revision` is the candidate its compiler retained for. */
  | { status: 'primed'; revision: string }
  | { status: 'skipped'; reason: string }
  /** Superseded by a compile, the watch stopping, the caller's signal, or dispose. */
  | { status: 'aborted' }
  | { status: 'failed'; code: string; message: string };

/** A worker compiler with the optional warm-up hook the build session looks for. */
export interface WorkerCompilationService extends CompilationService {
  /**
   * Present only with the persistent runtime and priming enabled (`persistent.prime`).
   *
   * Compiles `request` (a development request whose `previous` is the committed snapshot) in the
   * long-lived development runtime only to warm it: the compiler retains that generation's
   * program for the candidate revision, and the candidate itself never leaves the runtime. A
   * runtime that already retains a program for that revision (it compiled the startup
   * generation) returns at once. It runs only while idle and watching (otherwise it is
   * `skipped`), and every later `compile` (or the watch stopping) supersedes it through the
   * ordinary abort path.
   */
  prime?(request: CompilationRequest, signal: AbortSignal): Promise<PrimeOutcome>;
  /** Present only with the persistent runtime and the delta transport (`persistent.delta`). */
  acknowledge?(acknowledgement: CompilationAcknowledgement): void;
  /** Counters of the delta transport since the service was created. */
  transport(): DeltaTransportStatistics;
  /** The targeted rebuild's records the long-lived runtime returned. */
  targetedDryRun(): TargetedDryRunStatistics;
  /**
   * Whether `result` (as this service returned it) came from a targeted generation, whose
   * commit may be a delta against the committed snapshot. A full generation's commit must be the
   * full commit, which re-verifies every output.
   */
  targetedResult(result: CompilationResult): boolean;
}

/**
 * The compiler's retained-program kill switch (`INCREMENTAL_SKIP_ENV` in compiler/retention.ts,
 * re-exported by compiler/index.ts).
 */
const INCREMENTAL_SKIP_ENV = 'NGDOC_INCREMENTAL_SKIP';

export interface WorkerCompilationOptions {
  /** Absolute ESM URL exporting createCompilationService(options). */
  moduleUrl: string | URL;
  factoryOptions?: JsonValue;
  startupTimeoutMs?: number;
  compileTimeoutMs?: number;
  /** Active plus queued requests. Defaults to 8. */
  maxPendingRequests?: number;
  /** Default resolves beside this published ESM module. Also supports bundled test runtimes. */
  workerEntryUrl?: URL;
  /**
   * The long-lived runtime used for development watch generations (`context.lifetime` `watch`).
   * `false` runs every generation in its own disposable runtime. Defaults to enabled.
   */
  persistent?: boolean | PersistentWorkerOptions;
}

interface Job {
  id: number;
  request: string;
  /** Base revision (the previous snapshot's revision) for the persistent handshake. */
  base: string | null;
  lifetime: CompilationContext['lifetime'];
  /** A `prime` warm-up: the runtime replies with `primed` instead of the result. */
  prime?: { reply?: unknown; supersede(): void };
  /**
   * Delta transport: `request` is then the request without `previous`, which is kept here by
   * reference (the caller's own snapshot, unchanged while the job runs) and sent only on a resync.
   */
  delta?: { previous?: ArtifactSnapshot; host: Record<string, unknown> };
  /** The caller's progress sink (`context.progress`); the compile message then asks for updates. */
  progress?: ProgressRelay;
  signal: AbortSignal;
  abort(): void;
  resolve(result: CompilationResult): void;
}

interface Active {
  job: Job;
  /** The job's signal aborted. */
  abort(): void;
  /** The service is disposed: stop at once. */
  dispose(): void;
  stopped: Promise<void>;
}

type Reply = Record<string, unknown>;

/**
 * One long-lived child process. It evaluates the compiler module once; every generation still
 * gets its own compilation service (and so its own user-module evaluation scopes), disposed
 * before the reply. The only compilation state it keeps between generations is the compiler
 * module's own retained program, valid only for the base revision it produced, and, with the
 * delta transport, the committed snapshot of its base and the working snapshot of its last
 * candidate (plain JSON data, see entry.ts `serve`).
 */
interface Runtime {
  child: ChildProcess;
  /** Resolves when the runtime is ready (true) or can never become ready (false). */
  ready: Promise<boolean>;
  startupFailure?: CompilationResult;
  /** The base revision the runtime acknowledged (ready: null; then each resync). */
  base: string | null;
  /** Delta transport, as the runtime last reported: its committed and working snapshots. */
  committed: string | null;
  working: string | null;
  /** The runtime announced the delta transport in its `ready` message. */
  delta: boolean;
  /** A working revision the caller acknowledged as committed, promoted by the next compile for it. */
  promote?: string;
  /**
   * The caller's snapshot objects that equal the runtime's committed and working snapshots: the
   * object sent by the resync, and the candidate object returned for the working state.
   * The retained state serves a job only when its `previous` is that very object, never merely a
   * snapshot with the same revision (the revision does not cover every snapshot field).
   */
  committedSource?: { revision: string; snapshot: WeakRef<ArtifactSnapshot> };
  workingSource?: { revision: string; snapshot: WeakRef<ArtifactSnapshot> };
  /** Serving a job. */
  busy: boolean;
  /** The runtime sent `ready`; a job that finds it still starting reports a `boot` phase. */
  started: boolean;
  /** Receives the `progress` messages of the compile in flight (see `exchange`). */
  progress?: (reply: Reply) => void;
  /**
   * Resident set size the runtime reported after its idle collection. A report above the budget
   * retires an idle runtime at once, or a busy one as soon as its job resolves.
   */
  idleRss?: number;
  generations: number;
  closed: boolean;
  exited: Promise<void>;
  /** Receives replies, protocol errors and close while a request is outstanding. */
  handler?: (event: RuntimeEvent) => void;
}

type RuntimeEvent =
  | { type: 'reply'; reply: Reply }
  | { type: 'invalid'; message: string }
  | { type: 'close'; code: number | null };

function failure(code: string, message: string): CompilationResult {
  return {
    dependencies: [],
    diagnostics: [{ code, message, severity: 'error', stage: 'evaluation' }],
    whyRebuilt: [],
  };
}

function positive(value: number | undefined, fallback: number): number {
  const number = value ?? fallback;
  if (!Number.isSafeInteger(number) || number < 1 || number > 2_147_483_647) {
    throw new Error('Worker limits must be positive timer-safe integers');
  }
  return number;
}

function bytes(value: number | undefined, fallback: number): number {
  const number = value ?? fallback;
  if (!Number.isSafeInteger(number) || number < 1) {
    throw new Error('Worker memory limits must be positive safe integers');
  }
  return number;
}

/**
 * A runtime ends together with every process it started. The compiler's esbuild service is one:
 * it is unreferenced, never stopped, and exits only once it reads the end of its stdin after the
 * runtime died, so a host that exits right after `dispose` could leave it behind. On POSIX every
 * runtime therefore leads a process group of its own (`detached`); ending a runtime signals the
 * group, and a runtime counts as ended only once its group is empty. Windows has no process
 * groups: a runtime is not detached there (a detached child gets a console of its own), only the
 * runtime itself is signalled, and its esbuild service exits at the end of its stdin.
 */
const PROCESS_GROUPS = process.platform !== 'win32';
/**
 * How long a runtime's group may take to empty after the runtime exited. Normally milliseconds;
 * the bound only matters where orphans are never reaped (a host running as PID 1 without an init).
 */
const GROUP_EXIT_DEADLINE_MS = 2_000;

/**
 * Signals the runtime's process group (POSIX) or the runtime itself (Windows).
 * @param child The runtime.
 * @param signal The signal to send.
 */
function signalRuntime(child: ChildProcess, signal: NodeJS.Signals): void {
  if (PROCESS_GROUPS && child.pid) {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch {
      // ESRCH: the group is gone. EPERM: macOS answers it for a group whose members all exited
      // but are not reaped yet. Either way nothing is left to signal but the runtime itself.
    }
  }
  child.kill(signal);
}

/**
 * The runtime's process group still has a member; one exited but not reaped yet counts.
 * @param pid The runtime's pid, which is its process group id.
 */
function groupAlive(pid: number): boolean {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/**
 * Called once the runtime exited: kills what it left in its process group and resolves when the
 * group is empty, or after `GROUP_EXIT_DEADLINE_MS`.
 * @param child The runtime that exited.
 */
async function joinGroup(child: ChildProcess): Promise<void> {
  const pid = child.pid;
  if (!PROCESS_GROUPS || !pid || !groupAlive(pid)) return;
  signalRuntime(child, 'SIGKILL');
  const deadline = Date.now() + GROUP_EXIT_DEADLINE_MS;
  while (groupAlive(pid) && Date.now() < deadline) {
    await new Promise<void>((resolve) => setTimeout(resolve, 5));
  }
}

const ABORTED = (): CompilationResult => failure('WORKER_ABORTED', 'Compilation aborted');
const DISPOSED = (): CompilationResult =>
  failure('WORKER_DISPOSED', 'Compilation service is disposed');

const switchedOff = (value: string | undefined): boolean =>
  value !== undefined && /^(0|false|off|no)$/i.test(value.trim());

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** The compiler factory option `incrementalReuse: false` also turns the retained program off. */
function factoryReuseOff(value: JsonValue | undefined): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    value['incrementalReuse'] === false
  );
}

/** Maps a finished warm-up job to its outcome; the runtime's `primed` reply carries no candidate. */
function primeOutcome(result: CompilationResult, reply: unknown, aborted: boolean): PrimeOutcome {
  if (aborted) return { status: 'aborted' };
  const primed =
    reply !== null && typeof reply === 'object' ? (reply as Record<string, unknown>) : {};
  if (!result.diagnostics.length && typeof primed['revision'] === 'string') {
    return { status: 'primed', revision: primed['revision'] };
  }
  const code = result.diagnostics[0]?.code ?? String(primed['code'] ?? 'WORKER_PROTOCOL');
  const message =
    result.diagnostics[0]?.message ??
    String(primed['message'] ?? 'The warm-up produced no candidate');
  return { status: 'failed', code, message };
}

/**
 * One disposable runtime per generation bounds executable module lifetime. No output writes occur
 * here.
 *
 * Exception, development watch generations only (`context.lifetime === 'watch'`): they share one
 * long-lived runtime per watch session, which removes the per-generation fork, compiler-bundle
 * import and warm-up. User modules keep their per-generation lifetime there too: the runtime
 * creates a fresh compilation service for every generation and disposes it (its discovery and
 * template evaluation scopes, timers and network) before replying. Host-realm state is made
 * per-generation too (entry.ts `isolate`): the host's current env and cwd are sent with every
 * compile, and afterwards env, cwd, umask and `exitCode` are restored, process listeners added by
 * the generation are removed, and user (non-`node_modules`) CommonJS modules it loaded are evicted
 * from the require cache; a user ES module loaded through `require` cannot be evicted, so its
 * runtime is replaced before the next generation. Mutations of shared builtin modules cannot be
 * undone; the recycle bound is their backstop. The runtime exits when the host disconnects. It is
 * replaced when it crashes, exceeds a deadline, ignores a cooperative abort for `abortGraceMs`
 * (SIGKILL), or, while idle, after `maxGenerations` generations or above `maxRssBytes`; the next
 * generation then runs in a new, cold runtime. It ends when the watch stops and no watch
 * generation is running or queued. buildOnce, production and callers without a context use a
 * fresh one-shot runtime, except a development generation before the first watch while warm-ups
 * are allowed (`servesStartup`).
 *
 * Every runtime tells its compiler how long it lives (`context.lifetime`: `watch` in the
 * long-lived runtime, `generation` in a one-shot one), so only the long-lived runtime retains a
 * program. `prime` warms that runtime while idle (see `WorkerCompilationService.prime`).
 *
 * Delta transport (`PersistentWorkerOptions.delta`), for callers that pass `context.delta` (the
 * build session's watch generations): the request crosses without its previous snapshot whenever
 * the runtime retains that snapshot, the result crosses as a `SnapshotDelta` that is applied here
 * to the caller's own snapshot, and the runtime promotes a candidate to its base only after
 * `acknowledge` reports its commit. A fresh or recycled runtime, a base the runtime does not hold,
 * or any disagreement costs one resync with the full snapshot.
 */
export function createWorkerCompilationService(
  options: WorkerCompilationOptions,
): WorkerCompilationService {
  const startupTimeout = positive(options.startupTimeoutMs, 30_000);
  const compileTimeout = positive(options.compileTimeoutMs, 120_000);
  const limit = positive(options.maxPendingRequests, 8);
  const persistentOptions =
    options['persistent'] === false
      ? undefined
      : options['persistent'] === true || options['persistent'] === undefined
        ? {}
        : options['persistent'];
  const persistent = persistentOptions && {
    abortGraceMs: positive(persistentOptions.abortGraceMs, 1_500),
    maxGenerations: positive(persistentOptions.maxGenerations, 50),
    maxRssBytes: bytes(persistentOptions.maxRssBytes, 3 * 1024 ** 3),
    prime: persistentOptions.prime !== false,
    delta:
      persistentOptions.delta === false
        ? (false as const)
        : persistentOptions.delta === 'verify'
          ? ('verify' as const)
          : (true as const),
  };
  const verify = persistent?.delta === 'verify';
  const statistics: DeltaTransportStatistics = {
    deltas: 0,
    snapshotResyncs: 0,
    promotions: 0,
    fallbacks: 0,
    mismatches: 0,
    sentCharacters: 0,
    receivedCharacters: 0,
  };
  const dryRuns: TargetedDryRunStatistics = { records: 0, misses: 0 };
  /** A dry-run record returned with a compile's reply (see `TargetedDryRunStatistics`). */
  const targetedResults = new WeakSet<CompilationResult>();
  const dryRunReported = (record: unknown, result: CompilationResult): void => {
    if (record === null || typeof record !== 'object') return;
    dryRuns.records++;
    dryRuns.last = record;
    const { generation, misses, mismatch, published } = record as {
      generation?: unknown;
      misses?: unknown;
      mismatch?: unknown;
      published?: unknown;
    };
    if (published === 'targeted') targetedResults.add(result);
    const missed = Array.isArray(misses) && misses.length > 0;
    if (!missed && typeof mismatch !== 'string') return;
    dryRuns.misses++;
    process.emitWarning(
      `Targeted rebuild: generation ${String(generation)}` +
        (typeof mismatch === 'string'
          ? ` differs from the full generation at ${mismatch}; the full result is published`
          : '') +
        (missed
          ? ` changed ${(misses as unknown[]).length} unit(s) outside the targeted closure: ${(misses as unknown[]).join(', ')}`
          : ''),
      { code: 'COMPILATION_TARGETED_MISMATCH' },
    );
  };
  const moduleUrl = new URL(options['moduleUrl']).href;
  const workerData = encode({ moduleUrl, factoryOptions: options['factoryOptions'] });
  const persistentData = encode({
    moduleUrl,
    factoryOptions: options['factoryOptions'],
    persistent: true,
  });
  const entry = options.workerEntryUrl ?? new URL('./entry.js', import.meta.url);
  const queue: Job[] = [];
  let sequence = 0;
  let disposed = false;
  let watching = false;
  /**
   * The watch stopped (`watching(false)`): the runtime ends as soon as no watch-lifetime job is
   * running or queued, including jobs a caller other than the session queued after the stop.
   */
  let watchEnded = false;
  /** A watch generation was asked for: the long-lived runtime serves a watch (`servesStartup`). */
  let watchServed = false;
  let active: Active | undefined;
  let runtime: Runtime | undefined;
  /**
   * Every long-lived runtime until its process group is empty: the current one and any that is
   * still ending (recycled, retired after the watch, killed), which `runtime` no longer names.
   */
  const runtimes = new Set<Runtime>();
  /** Resolves once every runtime but the current one has ended. */
  const ending = (): Promise<void> =>
    Promise.all([...runtimes].filter((each) => each !== runtime).map((each) => each.exited)).then(
      () => undefined,
    );
  let disposing: Promise<void> | undefined;

  const retainedProgramOff = (): boolean =>
    switchedOff(process.env[INCREMENTAL_SKIP_ENV]) || factoryReuseOff(options.factoryOptions);

  /**
   * A development generation outside a watch, before any watch ran (a host's startup buildOnce,
   * which the watch reuses as its baseline), runs in the long-lived runtime when warm-ups are
   * allowed. The runtime then already retains that generation's program and index for the
   * committed revision, so the warm-up returns without compiling (entry.ts) and an edit right
   * after the start compiles against them. In a one-shot runtime they were lost, and the warm-up
   * that rebuilt them took as long as a full generation: an edit arriving meanwhile aborted it
   * and rebuilt every page.
   */
  function servesStartup(
    request: CompilationRequest | undefined,
    context: CompilationContext | undefined,
  ): boolean {
    return (
      context?.lifetime === 'generation' &&
      request?.mode === 'development' &&
      persistent?.prime === true &&
      !watching &&
      !watchEnded &&
      !watchServed &&
      !retainedProgramOff()
    );
  }

  function pump(): void {
    if (active || disposed) return;
    const job = queue.shift();
    if (!job) return;
    if (job.lifetime === 'watch' && persistent) runPersistent(job);
    else runFresh(job);
  }

  function runFresh(job: Job): void {
    let worker: ChildProcess;
    try {
      // Do not inherit test runners/loaders/--input-type from the embedding process.
      worker = fork(fileURLToPath(entry), [], {
        execArgv: [],
        detached: PROCESS_GROUPS,
        stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
        serialization: 'json',
      });
    } catch (error) {
      job.signal.removeEventListener('abort', job.abort);
      job.resolve(failure('WORKER_STARTUP', errorMessage(error)));
      pump();
      return;
    }
    let ended = false;
    let completed: CompilationResult;
    let ready = false;
    let stopped!: () => void;
    const stopping = new Promise<void>((resolve) => {
      stopped = resolve;
    });
    let timer: ReturnType<typeof setTimeout>;
    const finish = (result: CompilationResult): void => {
      if (ended) return;
      ended = true;
      clearTimeout(timer);
      job.signal.removeEventListener('abort', job.abort);
      job.progress?.settled();
      completed = result;
      // A process boundary is intentional: Worker.terminate cannot interrupt synchronous native code.
      signalRuntime(worker, 'SIGKILL');
    };
    active = {
      job,
      abort: () => finish(ABORTED()),
      dispose: () => finish(DISPOSED()),
      stopped: stopping,
    };
    timer = setTimeout(
      () =>
        finish(failure('WORKER_STARTUP_TIMEOUT', 'Compilation worker startup deadline exceeded')),
      startupTimeout,
    );
    job.progress?.boot('start');
    worker.on('message', (message: unknown) => {
      if (ended) return;
      try {
        const reply = decode(message);
        if (reply['type'] === 'progress') {
          if (ready && reply['id'] === job.id) job.progress?.forward(reply['update']);
        } else if (reply['type'] === 'ready' && !ready) {
          ready = true;
          job.progress?.boot('end');
          clearTimeout(timer);
          timer = setTimeout(
            () => finish(failure('WORKER_COMPILE_TIMEOUT', 'Compilation deadline exceeded')),
            compileTimeout,
          );
          worker.send(job.request, (error) => {
            if (error) finish(failure('WORKER_PROTOCOL', error.message));
          });
        } else if (reply['type'] === 'failure' && (!ready || reply['id'] === job.id)) {
          finish(failure(ready ? 'WORKER_COMPILE' : 'WORKER_STARTUP', String(reply['message'])));
        } else if (reply['type'] === 'result' && ready && reply['id'] === job.id) {
          finish(resultFrom(reply['result']));
        }
        // Late/foreign IDs cannot settle this generation or produce a candidate.
      } catch (error) {
        finish(failure('WORKER_PROTOCOL', errorMessage(error)));
      }
    });
    worker.on('error', (error) =>
      finish(failure(ready ? 'WORKER_CRASH' : 'WORKER_STARTUP', error.message)),
    );
    worker.on('close', (code) => {
      if (!ended)
        finish(failure('WORKER_EXIT', `Compilation worker exited before replying (${code})`));
      worker.removeAllListeners();
      // The generation ends only once nothing the runtime started is left.
      void joinGroup(worker).then(() => {
        active = undefined;
        job.resolve(job.signal.aborted ? ABORTED() : disposed ? DISPOSED() : completed);
        stopped();
        pump();
      });
    });
    worker.send(workerData, (error) => {
      if (error) finish(failure('WORKER_STARTUP', error.message));
    });
  }

  /** Starts the long-lived runtime. Throws when the process cannot be forked. */
  function spawn(): Runtime {
    const child = fork(fileURLToPath(entry), [], {
      // Only flag: lets the idle runtime collect a finished generation (see entry.ts).
      execArgv: ['--expose-gc'],
      detached: PROCESS_GROUPS,
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      // Messages are still JSON text (`encode`), validated and normalised once. With the delta
      // transport the advanced channel carries that string as is, where a `json` channel would
      // stringify (escape) and parse it a second time (about half of a large message's
      // transport). Without it (`delta: false`) the `json` channel is kept.
      serialization: persistent?.delta ? 'advanced' : 'json',
    });
    let exited!: () => void;
    let settleReady!: (value: boolean) => void;
    const created: Runtime = {
      child,
      ready: new Promise<boolean>((resolve) => {
        settleReady = resolve;
      }),
      base: null,
      committed: null,
      working: null,
      delta: false,
      busy: false,
      started: false,
      generations: 0,
      closed: false,
      exited: new Promise<void>((resolve) => {
        exited = resolve;
      }),
    };
    runtimes.add(created);
    let starting = true;
    const startupFailed = (result: CompilationResult): void => {
      if (!starting) return;
      starting = false;
      clearTimeout(timer);
      created.startupFailure = result;
      settleReady(false);
      signalRuntime(child, 'SIGKILL');
    };
    const timer = setTimeout(
      () =>
        startupFailed(
          failure('WORKER_STARTUP_TIMEOUT', 'Compilation worker startup deadline exceeded'),
        ),
      startupTimeout,
    );
    child.on('message', (message: unknown) => {
      if (typeof message === 'string') statistics.receivedCharacters += message.length;
      let reply: Reply;
      try {
        reply = decode(message);
      } catch (error) {
        if (starting) startupFailed(failure('WORKER_PROTOCOL', errorMessage(error)));
        else created.handler?.({ type: 'invalid', message: errorMessage(error) });
        return;
      }
      if (starting) {
        if (reply['type'] === 'ready') {
          starting = false;
          clearTimeout(timer);
          created.started = true;
          created.delta = reply['delta'] === true;
          settleReady(true);
        } else if (reply['type'] === 'failure') {
          startupFailed(failure('WORKER_STARTUP', String(reply['message'])));
        }
        return;
      }
      if (reply['type'] === 'idle') {
        // After the runtime's idle collection: the resident set that stays.
        if (typeof reply['rss'] === 'number') {
          created.idleRss = statistics.idleRss = reply['rss'];
          if (!created.busy && runtime === created && reply['rss'] > persistent!.maxRssBytes) {
            void retire(created, true);
            queueMicrotask(prepare);
          }
        }
        return;
      }
      // Advisory and never an answer: it must not settle the pending request.
      if (reply['type'] === 'progress') {
        created.progress?.(reply);
        return;
      }
      created.handler?.({ type: 'reply', reply });
    });
    child.on('error', (error) => {
      if (starting) startupFailed(failure('WORKER_STARTUP', error.message));
      else created.handler?.({ type: 'invalid', message: error.message });
    });
    child.on('close', (code) => {
      created.closed = true;
      startupFailed(failure('WORKER_STARTUP', `Compilation worker exited before ready (${code})`));
      child.removeAllListeners();
      if (runtime === created) runtime = undefined;
      created.handler?.({ type: 'close', code });
      // `exited` means that nothing the runtime started is left either.
      void joinGroup(child).then(() => {
        runtimes.delete(created);
        exited();
      });
    });
    child.send(persistentData, (error) => {
      if (error) startupFailed(failure('WORKER_STARTUP', error.message));
    });
    return created;
  }

  /** Stops a runtime: a graceful dispose message first when idle, SIGKILL otherwise or after grace. */
  function retire(target: Runtime, graceful: boolean): Promise<void> {
    if (runtime === target) runtime = undefined;
    if (target.closed) return target.exited;
    if (graceful && persistent) {
      target.child.send(encode({ type: 'dispose' }), () => {});
      const timer = setTimeout(
        () => signalRuntime(target.child, 'SIGKILL'),
        persistent.abortGraceMs,
      );
      void target.exited.then(() => clearTimeout(timer));
    } else {
      signalRuntime(target.child, 'SIGKILL');
    }
    return target.exited;
  }

  function prepare(): void {
    if (!persistent || disposed || !watching || runtime) return;
    try {
      runtime = spawn();
    } catch {
      // The next watch generation forks again and reports the failure.
    }
  }

  /**
   * Waits for the next runtime event accepted by `accept`, or a deadline. Only one request is
   * outstanding per runtime, so a single handler suffices; other replies are ignored.
   */
  function next(
    target: Runtime,
    accept: (reply: Reply) => boolean,
    timeoutMs: number,
  ): { event: Promise<RuntimeEvent | { type: 'timeout' }> } {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let settle!: (event: RuntimeEvent | { type: 'timeout' }) => void;
    const event = new Promise<RuntimeEvent | { type: 'timeout' }>((resolve) => {
      settle = resolve;
    });
    const done = (value: RuntimeEvent | { type: 'timeout' }): void => {
      clearTimeout(timer);
      if (target.handler === handler) target.handler = undefined;
      settle(value);
    };
    const handler = (value: RuntimeEvent): void => {
      if (value.type === 'reply' && !accept(value.reply)) return;
      done(value);
    };
    if (target.closed) settle({ type: 'close', code: null });
    else {
      target.handler = handler;
      timer = setTimeout(() => done({ type: 'timeout' }), timeoutMs);
    }
    return { event };
  }

  function send(target: Runtime, message: string): void {
    target.child.send(message, (error) => {
      if (error) target.handler?.({ type: 'invalid', message: error.message });
    });
  }

  /** Adopts the retention state a runtime reports with its replies (delta transport). */
  function observe(target: Runtime, reply: Reply): void {
    const state = record(reply['state']);
    if (state && (state['base'] === null || typeof state['base'] === 'string'))
      target.base = state['base'];
    target.committed = typeof state?.['committed'] === 'string' ? state['committed'] : null;
    target.working = typeof state?.['working'] === 'string' ? state['working'] : null;
    if (target.committedSource?.revision !== target.committed) target.committedSource = undefined;
    if (target.workingSource?.revision !== target.working) target.workingSource = undefined;
  }

  function runPersistent(job: Job): void {
    let stopped!: () => void;
    const stopping = new Promise<void>((resolve) => {
      stopped = resolve;
    });
    let abortRequested: (() => void) | undefined;
    let killed = false;
    let target: Runtime | undefined;
    const kill = (): void => {
      killed = true;
      if (target) void retire(target, false);
    };
    active = {
      job,
      abort: () => abortRequested?.(),
      dispose: kill,
      stopped: stopping,
    };
    /** Replaces the runtime after a protocol violation and reports it. */
    const broken = async (current: Runtime, message: string): Promise<CompilationResult> => {
      void retire(current, false);
      await current.exited;
      return failure('WORKER_PROTOCOL', message);
    };
    /** Sends one compile and waits for its reply; deadline, exit and bad replies end the job. */
    const exchange = async (
      current: Runtime,
      id: number,
      message: string,
    ): Promise<{ reply: Reply } | { result: CompilationResult }> => {
      const replied = next(
        current,
        (reply) =>
          (reply['type'] === 'result' || reply['type'] === 'failure') && reply['id'] === id,
        compileTimeout,
      );
      const relay = job.progress;
      current.progress = relay
        ? (reply) => {
            if (reply['id'] === id) relay.forward(reply['update']);
          }
        : undefined;
      abortRequested = () => {
        abortRequested = undefined;
        // Cooperative first: the compiler checks its signal between stages. SIGKILL after grace.
        send(current, encode({ type: 'abort', id }));
        const grace = setTimeout(() => {
          if (!current.closed) void retire(current, false);
        }, persistent!.abortGraceMs);
        void replied.event.then(() => clearTimeout(grace));
      };
      send(current, message);
      const event = await replied.event;
      current.progress = undefined;
      if (event.type === 'timeout') {
        void retire(current, false);
        await current.exited;
        return {
          result: job.signal.aborted
            ? ABORTED()
            : failure('WORKER_COMPILE_TIMEOUT', 'Compilation deadline exceeded'),
        };
      }
      if (event.type === 'close') {
        return {
          result: failure(
            'WORKER_EXIT',
            `Compilation worker exited before replying (${event.code})`,
          ),
        };
      }
      if (event.type === 'invalid') return { result: await broken(current, event.message) };
      return { reply: event.reply };
    };
    /** Sends a resync (with the base snapshot for the delta transport) and checks the reply. */
    const resync = async (
      current: Runtime,
      snapshot: ArtifactSnapshot | undefined,
    ): Promise<CompilationResult | undefined> => {
      let message: string;
      try {
        message = encode({
          type: 'resync',
          base: job.base,
          ...(snapshot ? { snapshot } : {}),
          ...(snapshot && verify ? { verify: true } : {}),
        });
      } catch (error) {
        return failure('WORKER_INPUT', errorMessage(error));
      }
      // A snapshot resync carries what a full-transport compile carried: it gets the compile
      // deadline.
      const resynced = next(
        current,
        (reply) => reply['type'] === 'resynced',
        snapshot ? compileTimeout : startupTimeout,
      );
      send(current, message);
      if (job.delta) statistics.sentCharacters += message.length;
      const event = await resynced.event;
      if (
        event.type !== 'reply' ||
        event.reply['base'] !== job.base ||
        (snapshot && record(event.reply['state'])?.['committed'] !== job.base)
      ) {
        void retire(current, false);
        if (killed || disposed) return DISPOSED();
        return event.type === 'close'
          ? failure('WORKER_EXIT', `Compilation worker exited before replying (${event.code})`)
          : failure('WORKER_PROTOCOL', 'Compilation worker did not acknowledge the base revision');
      }
      current.base = job.base;
      observe(current, event.reply);
      current.promote = undefined;
      current.workingSource = undefined;
      // Weak: only the caller's own object can match, and a collected one cannot be passed again;
      // the runtime never keeps a replaced snapshot alive.
      current.committedSource =
        snapshot && job.base !== null
          ? { revision: job.base, snapshot: new WeakRef(snapshot) }
          : undefined;
      if (snapshot) statistics.snapshotResyncs++;
      return undefined;
    };
    /** A compile reply that is not a transport problem: counts the generation, maybe recycles. */
    const served = (
      current: Runtime,
      reply: Reply,
      result: CompilationResult,
    ): CompilationResult => {
      current.generations++;
      if (typeof reply['rss'] === 'number') statistics.replyRss = reply['rss'];
      if (reply['dryRun'] !== undefined) dryRunReported(reply['dryRun'], result);
      recycle(current, reply);
      return result;
    };
    /** Full transport: the full request (with `previous`) out, the full result back. */
    const runFull = async (current: Runtime): Promise<CompilationResult> => {
      // Base-revision handshake: a runtime that retained a program for another base must not use it.
      if (current.base !== job.base) {
        const failed = await resync(current, undefined);
        if (failed) return failed;
      }
      if (job.signal.aborted) return ABORTED();
      const out = await exchange(current, job.id, job.request);
      if ('result' in out) return out.result;
      const reply = out.reply;
      observe(current, reply);
      if (reply['type'] === 'failure') {
        if (reply['code'] === 'WORKER_BASE_MISMATCH')
          return broken(current, String(reply['message']));
        return served(current, reply, failure('WORKER_COMPILE', String(reply['message'])));
      }
      let result: CompilationResult;
      try {
        result = resultFrom(reply['result']);
        if (job.prime) job.prime.reply = reply['primed'];
      } catch (error) {
        return broken(current, errorMessage(error));
      }
      return served(current, reply, result);
    };
    /**
     * Delta transport. The request goes without `previous` when the runtime already retains the
     * committed snapshot of the job's base, or will promote its working snapshot to it (the caller
     * acknowledged that commit); otherwise a resync sends the caller's snapshot first. The reply's
     * delta is applied to the caller's snapshot. A runtime that lacks the base, or a delta that
     * does not apply, costs one retry after a resync (the second time with a full result).
     */
    const runDelta = async (current: Runtime): Promise<CompilationResult> => {
      const { previous, host } = job.delta!;
      let full = false;
      for (let attempt = 0; ; attempt++) {
        // Identity, not revision: the runtime's snapshots serve only the caller's own objects they
        // were built from; any other snapshot, even of the same revision, resyncs.
        const promoting =
          !full &&
          current.promote !== undefined &&
          current.promote === job.base &&
          current.working === job.base &&
          current.workingSource?.snapshot.deref() === previous;
        const retained =
          current.base === job.base &&
          (job.base === null ||
            (current.committed === job.base &&
              current.committedSource?.snapshot.deref() === previous));
        if (!promoting && !retained) {
          const failed = await resync(current, job.base === null ? undefined : previous);
          if (failed) return failed;
        }
        if (job.signal.aborted) return ABORTED();
        current.promote = undefined;
        if (promoting) statistics.promotions++;
        const id = attempt ? ++sequence : job.id;
        const head = encode({
          type: 'compile',
          id,
          base: job.base,
          delta: true,
          ...(job.base !== null ? { retained: true } : {}),
          ...(promoting ? { promote: job.base } : {}),
          ...(full ? { full: true } : {}),
          ...(verify ? { verify: true } : {}),
          ...(job.prime ? { prime: true } : {}),
          // A retry compiles again from the start: it reports its phases only when the first
          // attempt reported none (it failed before compiling), never a second sequence.
          ...(job.progress && (!attempt || !job.progress.reported) ? { progress: true } : {}),
          host,
        });
        const message = `${head.slice(0, -1)},"request":${job.request}}`;
        statistics.sentCharacters += message.length;
        const out = await exchange(current, id, message);
        if ('result' in out) return out.result;
        const reply = out.reply;
        observe(current, reply);
        // Retained or promoted: either way the runtime's committed snapshot now equals `previous`.
        if (previous && job.base !== null && current.committed === job.base)
          current.committedSource = { revision: job.base, snapshot: new WeakRef(previous) };
        if (reply['type'] === 'failure') {
          if (
            reply['code'] === 'WORKER_RESYNC_REQUIRED' ||
            reply['code'] === 'WORKER_BASE_MISMATCH'
          ) {
            if (attempt) return broken(current, String(reply['message']));
            statistics.fallbacks++;
            current.committed = null;
            continue;
          }
          return served(current, reply, failure('WORKER_COMPILE', String(reply['message'])));
        }
        let result: CompilationResult;
        try {
          result = resultFrom(reply['result']);
        } catch (error) {
          return broken(current, errorMessage(error));
        }
        if (job.prime) {
          job.prime.reply = reply['primed'];
          return served(current, reply, result);
        }
        if (reply['delta'] === undefined) return served(current, reply, result);
        let candidate: ArtifactSnapshot;
        try {
          candidate = applySnapshotDelta(previous, reply['delta']);
        } catch (error) {
          if (attempt) return broken(current, errorMessage(error));
          // The runtime's retained state disagrees with the caller's: start again from a resync
          // and take the full candidate this time.
          statistics.fallbacks++;
          current.generations++;
          current.committed = null;
          current.working = null;
          full = true;
          continue;
        }
        let replaced = false;
        if (verify) {
          // Key-order exact: the rebuilt candidate must serialise to the full one.
          if (JSON.stringify(candidate) !== JSON.stringify(reply['full'])) {
            statistics.mismatches++;
            candidate = reply['full'] as ArtifactSnapshot;
            current.committed = null;
            current.working = null;
            current.committedSource = undefined;
            current.workingSource = undefined;
            replaced = true;
          }
          deepFreeze(candidate);
        }
        if (!replaced) {
          statistics.deltas++;
          if (current.working === candidate.revision)
            current.workingSource = {
              revision: candidate.revision,
              snapshot: new WeakRef(candidate),
            };
        }
        return served(current, reply, { ...result, candidate });
      }
    };
    const run = async (): Promise<CompilationResult> => {
      try {
        target = runtime && !runtime.closed ? runtime : (runtime = spawn());
      } catch (error) {
        return failure('WORKER_STARTUP', errorMessage(error));
      }
      const current = target;
      current.busy = true;
      // Abort while starting leaves the runtime warming up for the next generation.
      const aborted = new Promise<false>((resolve) => {
        abortRequested = () => resolve(false);
        if (job.signal.aborted) resolve(false);
      });
      const booting = !current.started;
      if (booting) job.progress?.boot('start');
      const ready = await Promise.race([current.ready, aborted]);
      if (booting && ready) job.progress?.boot('end');
      if (killed || disposed) return DISPOSED();
      if (job.signal.aborted) return ABORTED();
      if (!ready) return current.startupFailure ?? failure('WORKER_STARTUP', 'Worker is not ready');
      if (!job.delta) return runFull(current);
      if (current.delta) return runDelta(current);
      // A runtime without the delta transport gets the full message: the request with `previous`.
      const { previous, host } = job.delta;
      let request = job.request;
      try {
        if (previous)
          request = `${request.slice(0, -1)}${request.length > 2 ? ',' : ''}"previous":${encode(previous)}}`;
      } catch (error) {
        return failure('WORKER_INPUT', errorMessage(error));
      }
      const head = encode({
        type: 'compile',
        id: job.id,
        base: job.base,
        host,
        ...(job.prime ? { prime: true } : {}),
        ...(job.progress ? { progress: true } : {}),
      });
      job.request = `${head.slice(0, -1)},"request":${request}}`;
      delete job.delta;
      return runFull(current);
    };
    void run()
      .catch((error: unknown) => failure('WORKER_PROTOCOL', errorMessage(error)))
      .then(async (result) => {
        // A killed runtime must be gone before the next generation (or dispose) proceeds.
        if (killed && target && !target.closed) await target.exited;
        if (target) target.busy = false;
        // An idle report above the budget that arrived while this job ran retires the runtime now,
        // with a replacement warming in the background.
        if (
          target &&
          target === runtime &&
          !target.closed &&
          (target.idleRss ?? 0) > persistent!.maxRssBytes
        ) {
          void retire(target, true);
          queueMicrotask(prepare);
        }
        job.signal.removeEventListener('abort', job.abort);
        job.progress?.settled();
        active = undefined;
        job.resolve(job.signal.aborted ? ABORTED() : disposed ? DISPOSED() : result);
        stopped();
        if (watchEnded && runtime && !queue.some((next) => next.lifetime === 'watch')) {
          void retire(runtime, true);
        }
        pump();
      });
  }

  /**
   * Replaces an idle runtime that served `maxGenerations` generations or cannot evict a user
   * module. A delta runtime's `maxRssBytes` budget is checked against the resident set it reports
   * after its idle collection (the `idle` message), not at reply time; a runtime without idle
   * reports (an older entry) is still checked at reply time.
   */
  function recycle(target: Runtime, reply: Reply): void {
    const rss = target.delta ? 0 : typeof reply['rss'] === 'number' ? reply['rss'] : 0;
    if (
      reply['recycle'] !== true &&
      target.generations < persistent!.maxGenerations &&
      rss <= persistent!.maxRssBytes
    )
      return;
    void retire(target, true);
    // Warm the replacement while idle, so the next edit does not pay the cold start.
    queueMicrotask(prepare);
  }

  const service: WorkerCompilationService = {
    compile(request: CompilationRequest, signal: AbortSignal, context?: CompilationContext) {
      if (disposed) return Promise.resolve(DISPOSED());
      if (signal.aborted) return Promise.resolve(ABORTED());
      // A warm-up yields to every real compile and does not count against the limit.
      const priming = active?.job.prime;
      if (queue.length + Number(Boolean(active) && !priming) >= limit) {
        return Promise.resolve(
          failure('WORKER_QUEUE_FULL', 'Compilation pending-request limit exceeded'),
        );
      }
      let serialized: string;
      let delta: Job['delta'];
      const id = ++sequence;
      if (context?.lifetime === 'watch') watchServed = true;
      const lifetime =
        context?.lifetime === 'watch' || servesStartup(request, context) ? 'watch' : 'generation';
      const base =
        typeof request?.previous?.revision === 'string' ? request.previous.revision : null;
      const sink = context?.progress;
      const progress = typeof sink === 'function' ? new ProgressRelay(sink, signal) : undefined;
      const wanted = progress ? { progress: true } : {};
      try {
        // A one-shot runtime inherits the host's env and cwd at fork; the long-lived one
        // receives them with every generation.
        const host = () => ({ env: { ...process.env }, cwd: process.cwd() });
        if (lifetime === 'watch' && persistent?.delta && context?.delta === true) {
          // The caller's snapshot stays by reference; it crosses only if a resync needs it.
          const { previous, ...rest } = request;
          serialized = encode(rest);
          delta = { ...(previous ? { previous } : {}), host: host() };
        } else {
          serialized = encode(
            lifetime === 'watch' && persistent
              ? { type: 'compile', id, base, request, host: host(), ...wanted }
              : { type: 'compile', id, request, ...wanted },
          );
        }
      } catch (error) {
        return Promise.resolve(failure('WORKER_INPUT', errorMessage(error)));
      }
      return new Promise<CompilationResult>((resolve) => {
        const job: Job = {
          id,
          request: serialized,
          base,
          lifetime,
          ...(delta ? { delta } : {}),
          ...(progress ? { progress } : {}),
          signal,
          resolve,
          abort() {
            if (active?.job === job) {
              active.abort();
            } else {
              const index = queue.indexOf(job);
              if (index >= 0) queue.splice(index, 1);
              signal.removeEventListener('abort', job.abort);
              resolve(ABORTED());
            }
          },
        };
        signal.addEventListener('abort', job.abort, { once: true });
        queue.push(job);
        priming?.supersede();
        pump();
      });
    },
    prime(request: CompilationRequest, signal: AbortSignal): Promise<PrimeOutcome> {
      const skipped = (reason: string) =>
        Promise.resolve<PrimeOutcome>({ status: 'skipped', reason });
      if (disposed || !watching) return skipped('not watching');
      if (active || queue.length) return skipped('busy');
      if (retainedProgramOff()) return skipped('retained program disabled');
      if (request?.mode !== 'development' || typeof request.previous?.revision !== 'string')
        return skipped('not a development request with a previous snapshot');
      if (signal.aborted) return Promise.resolve({ status: 'aborted' });
      const id = ++sequence;
      const base = request.previous.revision;
      const host = { env: { ...process.env }, cwd: process.cwd() };
      let serialized: string;
      let delta: Job['delta'];
      try {
        if (persistent!.delta) {
          // Priming is also the delta transport's first resync: the runtime keeps this snapshot.
          const { previous, ...rest } = request;
          serialized = encode(rest);
          delta = { previous, host };
        } else {
          serialized = encode({ type: 'compile', id, base, request, host, prime: true });
        }
      } catch (error) {
        return Promise.resolve({
          status: 'failed',
          code: 'WORKER_INPUT',
          message: errorMessage(error),
        });
      }
      const controller = new AbortController();
      const forward = () => controller.abort();
      signal.addEventListener('abort', forward, { once: true });
      return new Promise<PrimeOutcome>((resolve) => {
        const job: Job = {
          id,
          request: serialized,
          base,
          lifetime: 'watch',
          ...(delta ? { delta } : {}),
          prime: { supersede: () => controller.abort() },
          signal: controller.signal,
          resolve(result: CompilationResult) {
            signal.removeEventListener('abort', forward);
            resolve(primeOutcome(result, job.prime!.reply, controller.signal.aborted || disposed));
          },
          abort() {
            if (active?.job === job) active.abort();
          },
        };
        controller.signal.addEventListener('abort', job.abort, { once: true });
        queue.push(job);
        pump();
      });
    },
    acknowledge(acknowledgement: CompilationAcknowledgement) {
      const current = runtime;
      if (!current || current.closed) return;
      // Only the runtime's own working candidate can be promoted; anything else (a discarded or
      // stale commit, or a candidate the runtime no longer holds) leaves its committed base, and
      // a later request for another base is served after a resync.
      current.promote =
        acknowledgement?.status === 'committed' && acknowledgement.revision === current.working
          ? current.working
          : undefined;
    },
    transport() {
      return { ...statistics };
    },
    targetedResult: (result) => targetedResults.has(result),
    targetedDryRun() {
      return structuredClone(dryRuns);
    },
    watching(value: boolean) {
      watching = value && !disposed;
      watchEnded = !watching;
      if (watching) {
        prepare();
        return Promise.resolve();
      }
      // A running watch generation finishes first; the runtime ends after the last one. A warm-up
      // is not worth finishing.
      active?.job.prime?.supersede();
      // Resolves once the runtime and what it started are gone (unless a queued watch job keeps it).
      if (active?.job.lifetime === 'watch') return active.stopped.then(ending);
      if (runtime) void retire(runtime, true);
      return ending();
    },
    dispose() {
      if (disposing) return disposing;
      disposed = true;
      watching = false;
      for (const job of queue.splice(0)) {
        job.signal.removeEventListener('abort', job.abort);
        job.resolve(DISPOSED());
      }
      const running = active;
      running?.dispose();
      // Every runtime, including one still ending gracefully, is killed and joined.
      disposing = Promise.all([
        running?.stopped ?? Promise.resolve(),
        ...[...runtimes].map((each) => retire(each, false)),
      ]).then(() => undefined);
      return disposing;
    },
  };
  // Without the persistent runtime, or with priming turned off, there is no hook at all: the
  // session then neither copies the snapshot for a warm-up nor records a priming state.
  if (!persistent?.prime) delete service.prime;
  // Without the delta transport the session keeps copying and sending full snapshots.
  if (!persistent?.delta) delete service.acknowledge;
  return service;
}
