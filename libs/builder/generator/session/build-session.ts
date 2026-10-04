import path from 'node:path';

import type {
  ArtifactSnapshot,
  BuildEvent,
  BuildResult,
  BuildSession,
  BuildSessionServices,
  CompilationAcknowledgement,
  CompilationContext,
  CompilationRequest,
  CompilationResult,
  ContentRequestOrigin,
  Diagnostic,
  FileChange,
  FileEventSource,
  OutputManifest,
  RebuildReason,
  WatchHandle,
  WatchInputs,
} from '../contracts';
import type { ProgressSink, ProgressTrigger } from '../progress/events';
import {
  type PhysicalInput,
  changedInputs,
  inputsUnchanged,
  physicalInputs,
  reobservedChanges,
} from './input-verification';
import { type GenerationProgress, SessionProgress } from './progress';
import { UnchangedSaves } from './unchanged-saves';
import { projectWatchInputs } from './watch-inputs';
import { isRescanSignal } from './watch-signals';

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

export interface SessionOptions {
  batchDelayMs?: number;
  maxQueuedBuilds?: number;
  /**
   * Consecutive watch generations that native changes may abort before the next one is allowed to
   * finish and publish. Later changes then form the following generation, so a continuous event
   * stream delays publication by at most one generation instead of starving it. Defaults to 3.
   */
  maxSupersessions?: number;
  /**
   * Discard watched `update` events whose file bytes equal the content the last committed
   * generation observed, while no active or queued generation has the path in its changes (see
   * UnchangedSaves). Discarded events are reported as an `unchanged` BuildEvent. Defaults to true.
   */
  skipUnchangedSaves?: boolean;
  /** Fallback for watcher/observer/teardown failures. Its own exceptions are contained. */
  onDiagnostic?: (diagnostic: Diagnostic) => void;
  /**
   * Progress events of every generation, buildOnce included, and of the input check and warm-up
   * outside generations (see `session/progress.ts`). Advisory: results are the same with and
   * without it. A failing consumer is reported once through `onDiagnostic` as the
   * `SESSION_PROGRESS_FAILED` warning and never stops a build or a watch.
   */
  onProgress?: ProgressSink;
}

export interface SessionState {
  disposed: boolean;
  generation: number;
  watching: boolean;
  building: boolean;
  queuedBuilds: number;
  pendingChanges: number;
  /** Results waited for on the watch's pending, queued or running generation (its `initial`). */
  pendingWatchWaiters: number;
  lastGoodRevision?: string;
  /**
   * The warm-up of the compiler's long-lived runtime after a reused startup baseline (see
   * `PrimingCompiler`): `running`, or how it ended. `primed` means the runtime retains a program
   * for the committed snapshot; `stale` means for another revision (the next generation rebuilds).
   */
  priming?: 'running' | 'primed' | 'stale' | 'skipped' | 'aborted' | 'failed';
}

/**
 * Optional warm-up hook of a compiler whose development watch generations share one long-lived
 * runtime (the worker compiler, worker/index.ts `prime`). It compiles the request in that runtime
 * only so that the runtime's compiler retains a program for the committed revision; nothing it
 * produces reaches the session. The session calls it at most once per watch, and only when the
 * watch reused a verified development buildOnce baseline, since that baseline may have been
 * compiled in a one-shot runtime and so left no program behind (a runtime that compiled it
 * returns at once). It resolves to an outcome with a `status`.
 */
interface PrimingCompiler {
  prime?(request: CompilationRequest, signal: AbortSignal): Promise<unknown>;
}

const PRIMING_OUTCOMES = new Set(['primed', 'skipped', 'aborted', 'failed']);

interface Batch {
  changes: Map<string, FileChange>;
  waiters: Array<Deferred<BuildResult>>;
  /** The source reported that events may be missing; re-observe the committed inputs. */
  rescan?: boolean;
}

interface WatchState {
  active: boolean;
  ready: boolean;
  observer?: (event: BuildEvent) => void;
  initial: Deferred<BuildResult>;
  initialGeneration?: number;
  pending?: Batch;
  timer?: ReturnType<typeof setTimeout>;
  subscription: Promise<{ dispose(): Promise<void> } | undefined>;
  stopping?: Promise<void>;
  /** Watch generations aborted by native changes since this watch last settled a generation. */
  superseded: number;
}

interface Job {
  /** A watch batch; buildOnce jobs have no kind. */
  kind?: 'filesystem';
  /**
   * `filesystem` when the batch has changes; `reconcile` when it has none (a rescan that found no
   * difference), which makes the compiler discard its retained program and the session ask for
   * the full commit.
   */
  origin?: Extract<ContentRequestOrigin, 'filesystem' | 'reconcile'>;
  mode: 'development' | 'production';
  changes: FileChange[];
  watch?: WatchState;
  waiters: Array<Deferred<BuildResult>>;
  rescan?: boolean;
}

interface ActiveJob extends Job {
  /** The filesystem observations of this attempt's compilation, once it returned any. */
  observed?: PhysicalInput[];
  generation: number;
  controller: AbortController;
  finished: Deferred<void>;
}

/**
 * The newest committed development buildOnce result and the filesystem inputs it observed. The
 * first watch that reuses it consumes it; a later watch without a newer baseline generates.
 */
interface StartupBaseline {
  result: Extract<BuildResult, { status: 'success' }>;
  inputs: PhysicalInput[];
  ownedRoots: string[];
}

export class SessionLifecycleError extends Error {
  constructor(readonly diagnostic: Diagnostic) {
    super(diagnostic.message);
    this.name = 'SessionLifecycleError';
  }
}

function diagnostic(
  code: string,
  message: string,
  stage: Diagnostic['stage'] = 'host',
): Diagnostic {
  return { code, message, stage, severity: 'error' };
}

/**
 * Freezes a JSON value in place; stops at objects that are already frozen, so freezing a delta
 * candidate costs only its new parts.
 */
function deepFreeze<T>(value: T): T {
  const pending: unknown[] = [value];
  while (pending.length) {
    const item = pending.pop();
    if (item === null || typeof item !== 'object' || Object.isFrozen(item)) continue;
    Object.freeze(item);
    for (const child of Object.values(item)) pending.push(child);
  }
  return value;
}

/**
 * A consumer's own copy of a result. A frozen snapshot (the delta transport's committed snapshot,
 * immutable by construction) is shared instead of copied; everything else is copied.
 */
function copyResult(result: BuildResult): BuildResult {
  if (result.status !== 'success' || !Object.isFrozen(result.snapshot))
    return structuredClone(result);
  return Object.fromEntries(
    Object.entries(result).map(([key, value]) => [
      key,
      key === 'snapshot' ? value : structuredClone(value),
    ]),
  ) as BuildResult;
}

function message(error: unknown): string {
  try {
    return error instanceof Error ? error.message : String(error);
  } catch {
    return 'Unknown error';
  }
}

/** A session owns one compiler and committer. Their instances must not be shared across sessions. */
export class GeneratorBuildSession implements BuildSession {
  private readonly delay: number;
  private readonly maxQueue: number;
  private readonly maxSupersessions: number;
  private readonly queue: Job[] = [];
  private generation = 0;
  private active?: ActiveJob;
  private watchState?: WatchState;
  private pumping?: Promise<void>;
  private disposing?: Promise<void>;
  private disposed = false;
  private snapshot?: ArtifactSnapshot;
  private manifest?: OutputManifest;
  private baseline?: StartupBaseline;
  /** Filesystem inputs observed by the generation that produced the committed snapshot. */
  private committedInputs?: { inputs: PhysicalInput[]; ownedRoots: string[] };
  /**
   * Filesystem inputs observed by the newest generation that failed after the last commit. Its
   * new inputs were never committed, so they are re-observed against what it read instead.
   */
  private failedInputs?: PhysicalInput[];
  private readonly unchanged?: UnchangedSaves;
  /** The running warm-up (see `prime`); aborted by any job, watch batch, watch stop or dispose. */
  private priming?: AbortController;
  private primingState?: SessionState['priming'];
  private readonly progress: SessionProgress;

  constructor(
    private readonly services: BuildSessionServices,
    private readonly options: SessionOptions = {},
  ) {
    this.delay = options.batchDelayMs ?? 20;
    this.maxQueue = options.maxQueuedBuilds ?? 128;
    this.maxSupersessions = options.maxSupersessions ?? 3;
    if (options.skipUnchangedSaves !== false) this.unchanged = new UnchangedSaves();
    this.progress = new SessionProgress(options.onProgress, (warning) => this.fallback(warning));
    if (
      !Number.isFinite(this.delay) ||
      this.delay < 0 ||
      !Number.isInteger(this.maxQueue) ||
      this.maxQueue < 1 ||
      !Number.isSafeInteger(this.maxSupersessions) ||
      this.maxSupersessions < 0
    ) {
      throw new SessionLifecycleError(
        diagnostic('SESSION_OPTIONS', 'Invalid batch delay, queue capacity or supersession bound'),
      );
    }
  }

  inspect(): SessionState {
    return {
      disposed: this.disposed,
      generation: this.generation,
      watching: !!this.watchState?.active,
      building: !!this.active,
      queuedBuilds: this.queue.length,
      pendingChanges: this.watchState?.pending?.changes.size ?? 0,
      pendingWatchWaiters: this.watchState ? this.watchWaiters(this.watchState) : 0,
      ...(this.snapshot ? { lastGoodRevision: this.snapshot.revision } : {}),
      ...(this.primingState ? { priming: this.primingState } : {}),
    };
  }

  /**
   * The host could not publish a generation this session committed (for example a Vite adapter
   * that failed to install it). Until the next successful generation no watched save is
   * discarded as unchanged, so re-saving a file retries the publication.
   */
  publicationFailed(): void {
    this.unchanged?.settled('failure');
  }

  /**
   * Re-observes inputs that a watch host has only just begun watching: its new physical watch
   * targets and the changes it rejected while the generation that recorded them ran. That
   * generation may have read a path before any watch existed, so a change in between would never
   * be reported. Each path is compared with what the newest settled generation observed (the
   * committed one, or a newer failed one, whose inputs were never committed). Each difference is
   * admitted as an ordinary watcher change, so it runs a `filesystem` generation, which keeps the
   * retained program; when nothing differs no generation runs, and the published generation's
   * reload is not held back by one. Resolves once any change is admitted, never waiting for a
   * generation. A lossy-watcher rescan still re-observes every committed input instead.
   */
  async reconcileInputs(paths: readonly string[]): Promise<void> {
    const state = this.watchState;
    if (this.disposed || !state?.active || !paths.length) return;
    const observed = this.failedInputs ?? this.committedInputs?.inputs ?? [];
    let changes: FileChange[];
    try {
      changes = await reobservedChanges(observed, this.committedInputs?.ownedRoots ?? [], paths);
    } catch {
      // Nothing could be compared: every path may have changed unseen.
      changes = paths.map((file): FileChange => ({ kind: 'update', path: file }));
    }
    if (this.disposed || this.watchState !== state || !state.active || !changes.length) return;
    const admitted = this.admit(state, changes);
    if (admitted === false || !admitted.length) return;
    const batch = this.batch(state);
    this.supersede(state, batch);
    admitted.forEach((event) => batch.changes.set(event.path, { ...event }));
    this.schedule(state);
  }

  /**
   * Re-observes every input the committed generation observed, as after a lossy-watcher error:
   * the next watch generation first compares each input with the filesystem and turns every
   * difference into an ordinary change (see `reconcile`). With differences it is a `filesystem`
   * generation: the compiler keeps its retained program only if the program's own sweep of what
   * it observed still holds. Without any it is a `reconcile` generation, which discards the
   * retained program. Either way the commit is the full one, which re-verifies every output. An
   * active watch generation is superseded as by a watched change. Resolves once scheduled,
   * never waiting for a generation; without an active watch there is nothing to reconcile.
   */
  async rescan(): Promise<void> {
    const state = this.watchState;
    if (this.disposed || !state?.active) return;
    this.scheduleRescan(state);
  }

  async buildOnce(options: { mode?: 'development' | 'production' } = {}): Promise<BuildResult> {
    this.assertOpen();
    const waiter = deferred<BuildResult>();
    this.enqueue({ mode: options.mode ?? 'production', changes: [], waiters: [waiter] });
    return waiter.promise;
  }

  async watch(source: FileEventSource, onEvent: (event: BuildEvent) => void): Promise<WatchHandle> {
    this.assertOpen();
    if (this.watchState)
      throw new SessionLifecycleError(
        diagnostic('SESSION_ALREADY_WATCHING', 'Stop the current watch before starting another'),
      );
    const state: WatchState = {
      active: true,
      ready: false,
      observer: onEvent,
      initial: deferred<BuildResult>(),
      subscription: Promise.resolve(undefined),
      superseded: 0,
    };
    this.watchState = state;
    // Invoke subscribe in a microtask so synchronous throws follow the same failure path.
    state.subscription = Promise.resolve()
      .then(() =>
        source.subscribe(
          (events) => {
            if (!state.active || events.length === 0) return undefined;
            const admitted = this.admit(state, events);
            // `false` tells a wrapping filter that no generation runs for these changes.
            if (admitted === false) return false;
            if (admitted.length) {
              const batch = this.batch(state);
              this.supersede(state, batch);
              admitted.forEach((event) => batch.changes.set(event.path, { ...event }));
              this.schedule(state);
            }
            return undefined;
          },
          (error) => {
            if (!state.active) return;
            this.emit(state, { kind: 'diagnostic', diagnostic: error });
            // Possibly lost events are not fatal: the watch continues and a reconciling
            // generation re-observes every committed input instead.
            if (state.active && isRescanSignal(error)) this.scheduleRescan(state);
          },
        ),
      )
      .then(async (subscription) => {
        // Events delivered while the baseline is verified stay in the pending batch: the watch
        // is not ready yet, so they cannot schedule. Any such event disqualifies the baseline.
        const baseline = state.active ? this.startupBaseline(state) : undefined;
        const unchanged = baseline ? await this.reobserve(baseline) : false;
        if (state.active) {
          state.ready = true;
          void this.watchRuntime(true);
          if (unchanged && this.startupBaseline(state) === baseline) {
            // The baseline result is a private copy made when it was recorded. It is handed to
            // exactly one watch without another full snapshot copy, so it is consumed here.
            const initial = baseline!.result;
            this.baseline = undefined;
            state.initialGeneration = initial.generation;
            state.initial.resolve(initial);
            if (this.queue.length) this.pump();
            else this.prime(state);
          } else {
            this.batch(state).waiters.unshift(state.initial);
            this.flush(state);
          }
        }
        return subscription;
      })
      .catch((error: unknown) => {
        if (state.active) {
          const errorDiagnostic = diagnostic('SESSION_WATCH_SUBSCRIBE', message(error));
          const result = this.failure(0, [errorDiagnostic]);
          state.initial.resolve(result);
          this.emit(state, { kind: 'result', result });
          this.fallback(errorDiagnostic);
          void this.stopWatch(state).catch(() => {});
        }
        return undefined;
      });
    return { initial: state.initial.promise, dispose: () => this.stopWatch(state) };
  }

  dispose(): Promise<void> {
    if (this.disposing) return this.disposing;
    this.disposed = true;
    this.stopPriming();
    this.active?.controller.abort();
    const watch = this.watchState;
    const observer = watch?.observer;
    const stopped = watch ? this.stopWatch(watch) : Promise.resolve();
    this.queue.splice(0).forEach((job) => this.cancel(job));
    this.baseline = undefined;
    this.committedInputs = undefined;
    this.failedInputs = undefined;
    this.unchanged?.reset();
    this.disposing = this.cleanup([
      stopped,
      Promise.resolve().then(() => this.services.compiler.dispose()),
      Promise.resolve().then(() => this.services.committer.dispose()),
      this.pumping ?? Promise.resolve(),
    ]).finally(() => {
      this.snapshot = undefined;
      this.manifest = undefined;
      if (observer) {
        try {
          void Promise.resolve(observer({ kind: 'disposed' })).catch((error: unknown) =>
            this.fallback(diagnostic('SESSION_OBSERVER_FAILED', message(error))),
          );
        } catch (error) {
          this.fallback(diagnostic('SESSION_OBSERVER_FAILED', message(error)));
        }
      }
    });
    return this.disposing;
  }

  private assertOpen(): void {
    if (this.disposed)
      throw new SessionLifecycleError(
        diagnostic('SESSION_DISPOSED', 'The build session is disposed'),
      );
  }

  private capacityError(): SessionLifecycleError {
    return new SessionLifecycleError(
      diagnostic('SESSION_QUEUE_FULL', 'The build session request queue is full'),
    );
  }

  private batch(state: WatchState): Batch {
    return (state.pending ??= { changes: new Map(), waiters: [] });
  }

  /** Marks the next watch batch to re-observe every committed input first (see `reconcile`). */
  private scheduleRescan(state: WatchState): void {
    const batch = this.batch(state);
    batch.rescan = true;
    this.supersede(state, batch);
    this.schedule(state);
  }

  private watchWaiters(state: WatchState): number {
    return (
      (state.pending?.waiters.length ?? 0) +
      this.queue
        .filter((job) => job.watch === state)
        .reduce((count, job) => count + job.waiters.length, 0) +
      (this.active?.watch === state ? this.active.waiters.length : 0)
    );
  }

  /**
   * A queued native change supersedes a watch snapshot even before the next generation starts.
   * Explicit buildOnce jobs remain independent; the next job still waits for this
   * compiler/committer call to settle, so shared compiler state is never concurrent. After
   * `maxSupersessions` consecutive aborted generations the active one is protected: it finishes
   * and publishes, and the batch runs next, so the newest change is always eventually committed.
   */
  private supersede(state: WatchState, batch: Batch): void {
    const active = this.active;
    if (active?.watch !== state || active.controller.signal.aborted) return;
    if (state.superseded >= this.maxSupersessions) return;
    state.superseded++;
    // Readiness belongs to the watch, rather than a particular supersedable generation. Keep it
    // on the next batch while ordinary request waiters retain their cancelled result for the
    // generation they requested.
    const initialIndex = active.waiters.indexOf(state.initial);
    if (initialIndex >= 0) {
      active.waiters.splice(initialIndex, 1);
      batch.waiters.unshift(state.initial);
    }
    active.changes.forEach((change) => {
      if (!batch.changes.has(change.path)) batch.changes.set(change.path, change);
    });
    if (active.rescan) batch.rescan = true;
    active.controller.abort();
  }

  /**
   * Screens native changes for unchanged saves. Returns the changes to batch, or `false` when every
   * change was discarded (no generation will run for them). Deferred saves return an empty list:
   * they are decided when the active generation settles.
   */
  private admit(state: WatchState, events: FileChange[]): FileChange[] | false {
    if (!this.unchanged) return events;
    let busy: Set<string> | undefined;
    const screened = this.unchanged.screen(events, {
      active: !!this.active,
      busy: (file) => (busy ??= this.busyPaths(state)).has(file),
    });
    if (screened.dropped.length) {
      this.emit(state, {
        kind: 'unchanged',
        changes: screened.dropped.map((change) => ({ ...change })),
      });
    }
    return screened.passed.length || screened.deferred ? screened.passed : false;
  }

  /** Normalized paths in the changes of the active job, every queued job and the pending batch. */
  private busyPaths(state: WatchState): Set<string> {
    const paths = new Set<string>();
    const add = (change: FileChange) => paths.add(path.resolve(change.path).replace(/\\/g, '/'));
    this.active?.changes.forEach(add);
    this.queue.forEach((job) => job.changes.forEach(add));
    state.pending?.changes.forEach(add);
    return paths;
  }

  private releaseDeferred(): void {
    const unchanged = this.unchanged;
    if (!unchanged?.deferredCount()) return;
    const state = this.watchState;
    const changes = unchanged.takeDeferred();
    if (!state?.active) return;
    const admitted = this.admit(state, changes);
    if (admitted === false || !admitted.length) return;
    const batch = this.batch(state);
    this.supersede(state, batch);
    admitted.forEach((event) => batch.changes.set(event.path, { ...event }));
    this.schedule(state);
  }

  private schedule(state: WatchState): void {
    // A watched change is real work: the warm-up yields at once, not only when the batch runs.
    this.stopPriming();
    if (!state.ready || state.timer) return;
    state.timer = setTimeout(() => {
      state.timer = undefined;
      this.flush(state);
    }, this.delay);
  }

  private flush(state: WatchState): void {
    if (!state.active || !state.pending) return;
    // At most one queued watch batch; events arriving during active work form the next batch.
    const queued = this.queue.find((job) => job.watch === state && job.kind === 'filesystem');
    const pending = state.pending;
    if (queued) {
      const changes = new Map(queued.changes.map((change) => [change.path, change]));
      pending.changes.forEach((change, path) => changes.set(path, change));
      queued.changes = [...changes.values()];
      queued.origin = queued.changes.length ? 'filesystem' : 'reconcile';
      queued.waiters.push(...pending.waiters);
      if (pending.rescan) queued.rescan = true;
    } else if (this.queue.length >= this.maxQueue) {
      // File events are retained under pressure, never silently dropped.
      this.schedule(state);
      return;
    } else {
      this.enqueue({
        kind: 'filesystem',
        origin: pending.changes.size ? 'filesystem' : 'reconcile',
        mode: 'development',
        changes: [...pending.changes.values()],
        waiters: pending.waiters,
        watch: state,
        ...(pending.rescan ? { rescan: true } : {}),
      });
    }
    state.pending = undefined;
  }

  private enqueue(job: Job): void {
    if (this.queue.length >= this.maxQueue) throw this.capacityError();
    this.stopPriming();
    // A watch batch runs before queued buildOnce jobs; each kind keeps its own order.
    const before =
      job.kind === 'filesystem' ? this.queue.findIndex((item) => item.kind !== 'filesystem') : -1;
    if (before < 0) this.queue.push(job);
    else this.queue.splice(before, 0, job);
    if (!job.watch || job.watch.ready) this.pump();
  }

  private pump(): void {
    if (this.pumping) return;
    this.pumping = Promise.resolve()
      .then(async () => {
        while (!this.disposed && this.queue.length) {
          const readyIndex = this.queue.findIndex((item) => !item.watch || item.watch.ready);
          if (readyIndex < 0) break;
          const job = this.queue.splice(readyIndex, 1)[0];
          this.baseline = undefined;
          const active: ActiveJob = {
            ...job,
            generation: ++this.generation,
            controller: new AbortController(),
            finished: deferred<void>(),
          };
          this.active = active;
          if (active.watch && active.waiters.includes(active.watch.initial)) {
            active.watch.initialGeneration = active.generation;
          }
          // Before the rescan: re-observing every committed input is part of this generation.
          const progress = this.progress.start(
            {
              generation: active.generation,
              trigger: progressTrigger(active),
              mode: active.mode,
              changes: active.changes.length,
            },
            () => this.isCurrent(active),
          );
          try {
            if (active.rescan) await this.reconcile(active);
            this.emit(active.watch ?? this.watchState, {
              kind: 'started',
              generation: active.generation,
              changes: structuredClone(active.changes),
            });
            const result = await this.execute(active, progress);
            if (result.status !== 'cancelled') this.unchanged?.settled(result.status);
            if (result.status === 'failure') this.failedInputs = active.observed ?? [];
            const validated = copyResult(result);
            progress?.settle(validated, this.snapshot);
            // Every consumer receives its own copy (a frozen delta snapshot is shared). Without a
            // watch observer (for example a buildOnce before watching) nothing else holds
            // `validated`, so the first waiter takes it.
            const target = active.watch ?? this.watchState;
            const observed = !!(target?.active && target.observer);
            active.waiters.forEach((waiter, index) =>
              waiter.resolve(index === 0 && !observed ? validated : copyResult(validated)),
            );
            if (active.watch && validated.status !== 'cancelled') active.watch.superseded = 0;
            this.emit(target, { kind: 'result', result: validated });
          } catch (error) {
            this.unchanged?.settled('failure');
            const result = this.failure(active.generation, [
              diagnostic('SESSION_INVALID_RESULT', message(error)),
            ]);
            progress?.settle(result, this.snapshot);
            active.waiters.forEach((waiter) => waiter.resolve(result));
            this.emit(active.watch ?? this.watchState, { kind: 'result', result });
          } finally {
            this.active = undefined;
            active.finished.resolve();
            // Before the next generation starts: saves deferred while this one ran are screened
            // against what it committed (or, if it did not commit, against the unchanged base).
            this.releaseDeferred();
          }
        }
      })
      .finally(() => {
        this.pumping = undefined;
        if (!this.disposed && this.queue.some((item) => !item.watch || item.watch.ready))
          this.pump();
      });
  }

  /**
   * Merges the changes a lossy watcher may have missed: every input observed by the committed
   * generation is re-observed and each difference becomes an ordinary change. If re-observation
   * itself fails, every recorded content input is treated as changed.
   */
  private async reconcile(job: ActiveJob): Promise<void> {
    const observed = this.committedInputs;
    if (!observed) return;
    let changes: FileChange[];
    try {
      changes = await changedInputs(observed.inputs, observed.ownedRoots);
    } catch {
      const roots = observed.ownedRoots;
      changes = observed.inputs.flatMap((input): FileChange[] =>
        input.kind === 'content' &&
        !roots.some((root) => input.path === root || input.path.startsWith(`${root}/`))
          ? [{ kind: 'update', path: input.path }]
          : [],
      );
    }
    if (!changes.length) return;
    const merged = new Map(job.changes.map((change) => [change.path, change]));
    changes.forEach((change) => merged.set(change.path, change));
    job.changes = [...merged.values()];
    if (job.kind === 'filesystem') job.origin = 'filesystem';
  }

  private isCurrent(job: ActiveJob): boolean {
    return (
      !this.disposed &&
      this.active === job &&
      !job.controller.signal.aborted &&
      (!job.watch || job.watch.active)
    );
  }

  private async execute(job: ActiveJob, progress?: GenerationProgress): Promise<BuildResult> {
    let diagnostics: Diagnostic[] = [];
    let whyRebuilt: RebuildReason[] = [];
    let watchInputs: WatchInputs | undefined;
    let stage: Diagnostic['stage'] = 'content';
    /** The revision of a delta candidate, acknowledged whatever happens to it. */
    let offered: string | undefined;
    let adopted = false;
    try {
      if (!this.isCurrent(job)) return this.cancelled(job.generation);
      // Development generations of an active watch may share one long-lived compiler runtime;
      // buildOnce and production get a one-shot runtime (the compiler may serve a development
      // buildOnce before the first watch from its long-lived runtime, see `PrimingCompiler`).
      const lifetime = job.watch && job.mode === 'development' ? 'watch' : 'generation';
      // Delta transport: with a compiler that acknowledges commits, a watch generation passes the
      // committed snapshot itself (it is never changed in place; a commit replaces it) and adopts
      // the returned result, whose candidate shares the unchanged artifacts with it, without
      // copying either. Every such candidate is acknowledged below.
      const delta =
        lifetime === 'watch' && typeof this.services.compiler.acknowledge === 'function';
      const request: CompilationRequest = {
        generation: job.generation,
        mode: job.mode,
        changes: job.changes,
        ...(this.snapshot
          ? { previous: delta ? this.snapshot : structuredClone(this.snapshot) }
          : {}),
        ...(job.origin ? { contentRequest: { origin: job.origin } } : {}),
      };
      const context: CompilationContext = delta ? { lifetime, delta } : { lifetime };
      // Non-enumerable, like the retention slot: a function must never be cloned or serialised.
      if (progress)
        Object.defineProperty(context, 'progress', {
          value: progress.compilation,
          enumerable: false,
        });
      const returned = await this.services.compiler.compile(
        request,
        job.controller.signal,
        context,
      );
      const compiled = delta ? returned : structuredClone(returned);
      // Asked of the object the compiler returned (the copy is not one it knows).
      const targeted = this.services.compiler.targetedResult?.(returned);
      if (delta && compiled.candidate) {
        offered = String(compiled.candidate.revision);
        // Immutable from here: committed, stored and shared with consumers without copies. Only
        // its new parts are frozen here; the rest is the (frozen) previous snapshot.
        deepFreeze(compiled.candidate);
      }
      // `compiled` is the session's private copy, so its candidate is committed and published
      // without another full copy. The reported diagnostics are copied (top-level and artifact
      // entries together): an in-process compiler may share one diagnostic object between both,
      // and reported diagnostics must never alias objects inside the published snapshot.
      diagnostics = structuredClone([
        ...compiled.diagnostics,
        ...(compiled.candidate?.artifacts.flatMap((artifact) => artifact.diagnostics) ?? []),
      ]);
      whyRebuilt = compiled.whyRebuilt;
      if (!this.isCurrent(job)) return this.cancelled(job.generation, diagnostics, whyRebuilt);
      try {
        watchInputs = projectWatchInputs(compiled.dependencies);
      } catch (error) {
        return this.failure(
          job.generation,
          [...diagnostics, diagnostic('SESSION_WATCH_INPUTS', message(error), 'host')],
          whyRebuilt,
        );
      }
      job.observed = physicalInputs(compiled.dependencies);
      if (diagnostics.some((item) => item.severity === 'error'))
        return this.failure(job.generation, diagnostics, whyRebuilt, watchInputs);
      if (!compiled.candidate)
        return this.failure(
          job.generation,
          [
            ...diagnostics,
            diagnostic('SESSION_NO_CANDIDATE', 'Compiler returned no candidate', 'content'),
          ],
          whyRebuilt,
          watchInputs,
        );
      const candidate = compiled.candidate;
      stage = 'commit';
      const previous = this.manifest ? structuredClone(this.manifest) : undefined;
      const base = previous ? this.commitBase(job, compiled, targeted) : undefined;
      progress?.commitStarted(base ? undefined : candidate);
      const committed = await this.services.committer.commit(
        {
          generation: job.generation,
          candidate,
          ...(previous ? { previous } : {}),
          ...(base ? { base: { snapshot: base, manifest: previous! } } : {}),
        },
        { isCurrent: (generation) => generation === job.generation && this.isCurrent(job) },
        job.controller.signal,
      );
      progress?.commitEnded(committed);
      diagnostics.push(...committed.diagnostics);
      if (
        committed.status === 'committed' &&
        (committed.manifest.generation !== job.generation ||
          committed.manifest.revision !== candidate.revision ||
          committed.manifest.projectId !== candidate.projectId)
      ) {
        diagnostics.push(
          diagnostic(
            'SESSION_COMMIT_PROTOCOL',
            'Committed manifest does not identify the candidate generation',
            'commit',
          ),
        );
      }
      // A `committed` result is on disk whether or not this job is still current: a supersession
      // can land after the committer's last guard check. The session adopts it in every case, so
      // that the next commit's previous manifest is the one on disk, and the superseding batch
      // runs against it. Hosts must learn that manifest too, so such a generation is reported as a
      // `success` marked `superseded`, never as `cancelled`. A disposed session has no next
      // commit: it adopts nothing and reports `cancelled`.
      const inputs =
        committed.status === 'committed' &&
        !this.disposed &&
        !diagnostics.some((item) => item.severity === 'error')
          ? this.adopt(compiled, candidate, committed.manifest, offered !== undefined)
          : undefined;
      if (inputs) adopted = offered !== undefined;
      const superseded = !this.isCurrent(job);
      if (committed.status === 'stale' || this.disposed || (!inputs && superseded))
        return this.cancelled(job.generation, diagnostics, whyRebuilt);
      if (committed.status === 'failed') {
        if (!diagnostics.some((item) => item.severity === 'error'))
          diagnostics.push(diagnostic('SESSION_COMMIT_FAILED', 'Output commit failed', 'commit'));
        return this.failure(job.generation, diagnostics, whyRebuilt, watchInputs);
      }
      if (!inputs) return this.failure(job.generation, diagnostics, whyRebuilt, watchInputs);
      const success: Extract<BuildResult, { status: 'success' }> = {
        status: 'success',
        generation: job.generation,
        snapshot: candidate,
        manifest: committed.manifest,
        diagnostics,
        whyRebuilt,
        watchInputs,
        ...(superseded ? { superseded: true as const } : {}),
      };
      if (superseded) return success;
      const { physical, ownedRoots } = inputs;
      // Only a development buildOnce seeds a later watch. A candidate without recorded
      // filesystem inputs cannot be verified and always receives a post-subscription generation.
      if (job.kind === undefined && job.mode === 'development' && physical.length) {
        this.baseline = {
          result: structuredClone(success),
          inputs: physical,
          ownedRoots,
        };
      }
      return success;
    } catch (error) {
      diagnostics.push(
        diagnostic(
          stage === 'commit' ? 'SESSION_COMMIT_THROW' : 'SESSION_COMPILER_THROW',
          message(error),
          stage,
        ),
      );
      return this.isCurrent(job)
        ? this.failure(job.generation, diagnostics, whyRebuilt, watchInputs)
        : this.cancelled(job.generation, diagnostics, whyRebuilt);
    } finally {
      // Before the next compile: the runtime promotes its working state only for a commit.
      if (offered !== undefined) {
        this.acknowledge({
          generation: job.generation,
          revision: offered,
          status: adopted ? 'committed' : 'discarded',
        });
      }
    }
  }

  /**
   * Makes a committed candidate the session's state: snapshot and manifest (a delta candidate is
   * already private, its unchanged artifacts are the previous snapshot's) and the filesystem
   * inputs it observed.
   */
  private adopt(
    compiled: CompilationResult,
    candidate: ArtifactSnapshot,
    manifest: OutputManifest,
    delta: boolean,
  ): { physical: PhysicalInput[]; ownedRoots: string[] } {
    this.snapshot = delta ? candidate : structuredClone(candidate);
    this.manifest = structuredClone(manifest);
    const physical = physicalInputs(compiled.dependencies);
    const owned = candidate.configuration;
    const ownedRoots = owned ? [owned.outputRoot, owned.cacheRoot] : [];
    this.committedInputs = { inputs: physical, ownedRoots };
    this.failedInputs = undefined;
    this.unchanged?.committed(physical);
    return { physical, ownedRoots };
  }

  /**
   * The committed snapshot a watch generation's commit may be a delta against: with
   * `this.manifest`, the pair that one acknowledgement made the session's state (`adopt` sets
   * both). The committer still checks that this is what it last published.
   * Undefined asks for the full commit, which re-verifies every output and so repairs external
   * edits of unchanged ones: for builds outside a watch, for reconciling
   * generations (a watcher rescan or `rescan()`), and for a generation whose compiler
   * found a previously published output missing on disk (`output-missing`), and for every full
   * generation of a compiler that tells full from targeted ones (`targetedResult`): full
   * generations repair. Such a compiler keeps reporting `output-missing` for every published
   * output, not only the recompiled ones.
   */
  private commitBase(
    job: ActiveJob,
    compiled: CompilationResult,
    targeted: boolean | undefined,
  ): ArtifactSnapshot | undefined {
    if (!this.snapshot || !job.watch || job.mode !== 'development') return undefined;
    if (job.rescan || job.origin === 'reconcile') return undefined;
    if (compiled.whyRebuilt.some((reason) => reason.reason === 'output-missing')) return undefined;
    if (targeted === false) return undefined;
    return this.snapshot;
  }

  /** Reports a delta candidate's outcome to the compiler. A failing hook is only reported. */
  private acknowledge(acknowledgement: CompilationAcknowledgement): void {
    try {
      this.services.compiler.acknowledge?.(acknowledgement);
    } catch (error) {
      this.fallback(diagnostic('SESSION_COMPILER_ACKNOWLEDGE', message(error)));
    }
  }

  /**
   * A development buildOnce result may replace the post-subscription generation only while it is
   * the newest generation and no watcher event is pending. The caller checks this before and
   * again synchronously after re-observing the inputs.
   */
  private startupBaseline(state: WatchState): StartupBaseline | undefined {
    const baseline = this.baseline;
    return baseline &&
      !this.disposed &&
      state.active &&
      !state.pending &&
      baseline.result.generation === this.generation
      ? baseline
      : undefined;
  }

  /**
   * Every recorded filesystem input must re-observe identically after subscription. A change
   * before subscription is found here; a later one is reported by the watcher. A verification
   * error keeps the ordinary generation.
   */
  private async reobserve(baseline: StartupBaseline): Promise<boolean> {
    this.progress.activity('checking-inputs', 'start');
    try {
      return await inputsUnchanged(baseline.inputs, baseline.ownedRoots);
    } catch {
      return false;
    } finally {
      this.progress.activity('checking-inputs', 'end');
    }
  }

  private failure(
    generation: number,
    diagnostics: Diagnostic[],
    whyRebuilt: RebuildReason[] = [],
    watchInputs?: WatchInputs,
  ): BuildResult {
    return {
      status: 'failure',
      generation,
      diagnostics,
      whyRebuilt,
      ...(this.snapshot ? { lastGoodRevision: this.snapshot.revision } : {}),
      ...(watchInputs ? { watchInputs } : {}),
    };
  }

  private cancelled(
    generation: number,
    diagnostics: Diagnostic[] = [],
    whyRebuilt: RebuildReason[] = [],
  ): BuildResult {
    return {
      status: 'cancelled',
      generation,
      diagnostics,
      whyRebuilt,
      ...(this.snapshot ? { lastGoodRevision: this.snapshot.revision } : {}),
    };
  }

  private cancel(job: Pick<Job, 'waiters'>): void {
    job.waiters.forEach((waiter) => waiter.resolve(this.cancelled(0)));
  }

  private stopWatch(state: WatchState): Promise<void> {
    if (state.stopping) return state.stopping;
    this.stopPriming();
    state.active = false;
    state.observer = undefined;
    if (state.timer) clearTimeout(state.timer);
    state.timer = undefined;
    this.unchanged?.clearDeferred();
    state.initial.resolve(this.cancelled(state.initialGeneration ?? 0));
    if (state.pending) this.cancel(state.pending);
    state.pending = undefined;
    for (let index = this.queue.length - 1; index >= 0; index--) {
      if (this.queue[index].watch === state) this.cancel(this.queue.splice(index, 1)[0]);
    }
    const active = this.active?.watch === state ? this.active : undefined;
    active?.controller.abort();
    state.stopping = this.cleanup([
      state.subscription.then((subscription) => subscription?.dispose()),
      // The long-lived runtime ends only after the watch generation it serves has settled.
      (active?.finished.promise ?? Promise.resolve()).then(() => this.watchRuntime(false)),
    ]).finally(() => {
      if (this.watchState === state) this.watchState = undefined;
    });
    return state.stopping;
  }

  /**
   * Warms the compiler's long-lived runtime right after a watch reused the startup baseline. The
   * baseline was compiled by a one-shot runtime, or restored by the fast start without building a
   * program, so without this the first edit rebuilds the whole TypeScript program. The request is
   * the one a no-change
   * development generation would send for the committed snapshot; the compiler is deterministic,
   * so its candidate has the committed revision and the runtime's retained program is valid for
   * the first edit's base. Nothing comes back: no generation number is used, and nothing is
   * committed, published, emitted or reported (a failing hook is contained). Any job, watched
   * change, watch stop or dispose aborts it (`stopPriming`).
   */
  private prime(state: WatchState): void {
    const compiler = this.services.compiler as BuildSessionServices['compiler'] & PrimingCompiler;
    const snapshot = this.snapshot;
    if (
      typeof compiler.prime !== 'function' ||
      !snapshot ||
      this.priming ||
      this.active ||
      this.queue.length ||
      state.pending ||
      !state.active
    ) {
      return;
    }
    const controller = new AbortController();
    this.priming = controller;
    this.primingState = 'running';
    this.progress.activity('warming-up', 'start');
    // With the delta transport the committed snapshot is immutable and passed as is: this warm-up
    // is also the runtime's first resync, and later deltas share its (frozen) artifacts.
    const delta = typeof compiler.acknowledge === 'function';
    const request: CompilationRequest = {
      generation: this.generation,
      mode: 'development',
      changes: [],
      previous: delta ? deepFreeze(snapshot) : structuredClone(snapshot),
    };
    const settle = (outcome: unknown) => {
      const status = (outcome as { status?: unknown } | undefined)?.status;
      if (this.priming === controller) {
        this.priming = undefined;
        this.progress.activity(
          'warming-up',
          'end',
          status === 'primed' || status === 'skipped' ? undefined : 'failed',
        );
      }
      const revision = (outcome as { revision?: unknown } | undefined)?.revision;
      this.primingState =
        status === 'primed'
          ? revision === snapshot.revision
            ? 'primed'
            : 'stale'
          : typeof status === 'string' && PRIMING_OUTCOMES.has(status)
            ? (status as SessionState['priming'])
            : 'failed';
    };
    try {
      void Promise.resolve(compiler.prime(request, controller.signal)).then(settle, () =>
        settle(undefined),
      );
    } catch {
      settle(undefined);
    }
  }

  private stopPriming(): void {
    if (!this.priming) return;
    this.priming.abort();
    this.priming = undefined;
    // Ends before the work that stopped it starts, so it never overlaps a generation.
    this.progress.activity('warming-up', 'end', 'stopped');
  }

  /** Tells the compiler that the watch started or stopped. A failing hook is only reported. */
  private watchRuntime(active: boolean): Promise<void> {
    const report = (error: unknown) =>
      this.fallback(diagnostic('SESSION_COMPILER_WATCHING', message(error)));
    try {
      return Promise.resolve(this.services.compiler.watching?.(active)).catch(report);
    } catch (error) {
      report(error);
      return Promise.resolve();
    }
  }

  private emit(state: WatchState | undefined, event: BuildEvent): void {
    if (!state?.active || !state.observer) return;
    try {
      void Promise.resolve(state.observer(event)).catch((error: unknown) =>
        this.observerFailed(state, error),
      );
    } catch (error) {
      this.observerFailed(state, error);
    }
  }

  private observerFailed(state: WatchState, error: unknown): void {
    this.fallback(diagnostic('SESSION_OBSERVER_FAILED', message(error)));
    void this.stopWatch(state).catch(() => {});
  }

  private fallback(error: Diagnostic): void {
    try {
      void Promise.resolve(this.options.onDiagnostic?.(error)).catch(() => {});
    } catch {
      /* A failing diagnostic consumer must not prevent cleanup. */
    }
  }

  private async cleanup(operations: Array<Promise<unknown>>): Promise<void> {
    const results = await Promise.allSettled(operations);
    const errors = results.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    if (errors.length) {
      const failure = diagnostic(
        'SESSION_DISPOSE_FAILED',
        errors.map((error) => message(error.reason)).join('; '),
      );
      this.fallback(failure);
      throw new SessionLifecycleError(failure);
    }
  }
}

/** Why a generation runs, for progress: a buildOnce, a watcher rescan, or watched changes. */
function progressTrigger(job: Job): ProgressTrigger {
  if (job.kind === undefined) return 'build';
  return job.rescan || job.origin === 'reconcile' ? 'rescan' : 'watch';
}

export function createBuildSession(
  services: BuildSessionServices,
  options?: SessionOptions,
): GeneratorBuildSession {
  return new GeneratorBuildSession(services, options);
}
