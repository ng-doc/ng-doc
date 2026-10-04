import type {
  ArtifactSnapshot,
  BuildResult,
  CommitResult,
  CompilationProgressUpdate,
  Diagnostic,
  Generation,
  PageArtifact,
} from '../contracts';
import type {
  ProgressActivityEvent,
  ProgressCounts,
  ProgressEvent,
  ProgressPass,
  ProgressPhase,
  ProgressSink,
  ProgressStatus,
  ProgressTrigger,
} from '../progress/events';
import { guardProgressSink, PROGRESS_PHASES } from '../progress/events';

/** What a generation reports when it starts. */
export interface ProgressJob {
  generation: Generation;
  trigger: ProgressTrigger;
  mode: 'development' | 'production';
  /** File changes behind the generation, before a rescan adds what it found. */
  changes: number;
}

type Activity = ProgressActivityEvent['activity'];

/** A compilation update, or the session's own commit phase. */
type PhaseUpdate = Omit<CompilationProgressUpdate, 'phase'> & { phase: ProgressPhase };

/** At most this many routes name an edit's rebuilt pages. */
const ROUTES = 3;

/**
 * The session's progress events (`SessionOptions.onProgress`). Advisory only: nothing here reads
 * or changes what a generation compiles, commits or publishes. Without a consumer every call is a
 * single branch. Timings come from the session's own clock, and a failing consumer is reported
 * once as `SESSION_PROGRESS_FAILED` and never stops anything.
 */
export class SessionProgress {
  private readonly sink?: (event: ProgressEvent) => void;
  private readonly activities = new Map<Activity, number>();

  constructor(
    sink: ProgressSink | undefined,
    report: (diagnostic: Diagnostic) => void,
    private readonly now: () => number = () => performance.now(),
  ) {
    if (sink) this.sink = guardProgressSink(sink, report);
  }

  /**
   * A generation started. `isCurrent` gates every later update: once the generation is aborted or
   * superseded, only its one `progress-settled` event follows.
   */
  start(job: ProgressJob, isCurrent: () => boolean): GenerationProgress | undefined {
    return this.sink ? new GenerationProgress(this.sink, job, isCurrent, this.now) : undefined;
  }

  /**
   * Work outside a generation: the input check after a watch starts, and the warm-up. An end may
   * say the work `failed`, or that other work `stopped` it first.
   */
  activity(activity: Activity, state: 'start' | 'end', outcome?: 'failed' | 'stopped'): void {
    if (!this.sink) return;
    const at = this.now();
    if (state === 'start') {
      this.activities.set(activity, at);
      this.sink({ kind: 'progress-activity', activity, state, elapsedMs: 0 });
      return;
    }
    const started = this.activities.get(activity);
    if (started === undefined) return;
    this.activities.delete(activity);
    this.sink({
      kind: 'progress-activity',
      activity,
      state,
      ...(outcome ? { [outcome]: true } : {}),
      elapsedMs: Math.max(0, at - started),
    });
  }
}

/**
 * One generation's events: `progress-started`, the compilation's phases (compiler and worker, see
 * `compilation`), the session's commit, then exactly one settle.
 */
export class GenerationProgress {
  private seq = 0;
  private readonly startedAt: number;
  private phases: Partial<Record<ProgressPhase, number>> = {};
  private open?: { phase: ProgressPhase; at: number };
  private commit?: CommitResult;
  private settled = false;
  private pass?: ProgressPass;
  private reason?: string;
  /** The compilation's updates, stamped and gated like the session's own (`compile` context). */
  readonly compilation = (update: CompilationProgressUpdate): void => this.update(update);

  constructor(
    private readonly sink: (event: ProgressEvent) => void,
    private readonly job: ProgressJob,
    private readonly isCurrent: () => boolean,
    private readonly now: () => number,
  ) {
    this.startedAt = now();
    sink({
      kind: 'progress-started',
      generation: job.generation,
      seq: 0,
      trigger: job.trigger,
      mode: job.mode,
      changes: job.changes,
      elapsedMs: 0,
    });
  }

  /**
   * The commit starts. A full commit (`full` is the candidate) compares every candidate output, so
   * their count is the total; a delta commit writes an unknown share of them.
   */
  commitStarted(full?: ArtifactSnapshot): void {
    let total: number | undefined;
    try {
      total = full?.artifacts.reduce((count, artifact) => count + artifact.outputs.length, 0);
    } catch {
      total = undefined;
    }
    this.update({
      phase: 'commit',
      state: 'start',
      ...(Number.isSafeInteger(total) ? { completed: 0, total } : {}),
    });
  }

  commitEnded(result: CommitResult): void {
    this.commit = result;
    this.update({ phase: 'commit', state: 'end' });
  }

  /** The generation's outcome. `previous` is the last committed snapshot, for a failure's page count. */
  settle(result: BuildResult, previous?: ArtifactSnapshot): void {
    if (this.settled) return;
    this.settled = true;
    const at = this.now();
    if (this.open) this.close(at);
    const status: ProgressStatus =
      result.status === 'success' ? (result.superseded ? 'superseded' : 'success') : result.status;
    this.sink({
      kind: 'progress-settled',
      generation: this.job.generation,
      seq: ++this.seq,
      status,
      elapsedMs: Math.max(0, at - this.startedAt),
      phases: { ...this.phases },
      ...(this.pass ? { pass: this.pass } : {}),
      ...(this.reason ? { reason: this.reason } : {}),
      counts: this.safeCounts(result, previous),
    });
  }

  /** Counts never decide an outcome: a result they cannot read is reported without them. */
  private safeCounts(result: BuildResult, previous?: ArtifactSnapshot): ProgressCounts {
    try {
      return this.counts(result, previous);
    } catch {
      return { pages: 0, rebuilt: 0, errors: 0, warnings: 0 };
    }
  }

  /**
   * A phase update from the compilation or the session. The session's clock times it: no clock
   * crosses the worker boundary.
   */
  private update(update: PhaseUpdate): void {
    if (this.settled) return;
    const at = this.now();
    const { phase, state, completed, total, reused, pass, reason } = update;
    // A fall back to the full pass restarts the phases from `phase`: the phases it runs again
    // are timed for the last pass only, and those before it (the analysis) keep their time.
    if (pass === 'full' && this.pass === 'targeted') {
      if (this.open) this.close(at);
      const from = PROGRESS_PHASES.indexOf(phase);
      for (const earlier of PROGRESS_PHASES.slice(from < 0 ? 0 : from)) delete this.phases[earlier];
    }
    if (pass) this.pass = pass;
    if (pass === 'full' && reason) this.reason = reason;
    // Durations are kept for the settle even when the generation is no longer shown.
    if (state === 'start') {
      if (this.open) this.close(at);
      this.open = { phase, at };
    } else if (state === 'end' && this.open?.phase === phase) this.close(at);
    if (!this.isCurrent()) return;
    this.sink({
      kind: 'progress',
      generation: this.job.generation,
      seq: ++this.seq,
      phase,
      state,
      ...(completed !== undefined ? { completed } : {}),
      ...(total !== undefined ? { total } : {}),
      ...(reused !== undefined ? { reused } : {}),
      ...(pass ? { pass } : {}),
      ...(reason ? { reason } : {}),
      elapsedMs: Math.max(0, at - this.startedAt),
    });
  }

  private close(at: number): void {
    const open = this.open!;
    this.open = undefined;
    this.phases[open.phase] = (this.phases[open.phase] ?? 0) + Math.max(0, at - open.at);
  }

  private counts(result: BuildResult, previous?: ArtifactSnapshot): ProgressCounts {
    const snapshot = result.status === 'success' ? result.snapshot : previous;
    const aggregate = new Set<string>();
    let pages = 0;
    for (const artifact of snapshot?.artifacts ?? []) {
      if (artifact.identity.role === 'aggregate') aggregate.add(artifact.id);
      else pages++;
    }
    const owners: string[] = [];
    const seen = new Set<string>();
    for (const reason of result.whyRebuilt) {
      if (seen.has(reason.ownerId) || aggregate.has(reason.ownerId)) continue;
      seen.add(reason.ownerId);
      owners.push(reason.ownerId);
    }
    let errors = 0;
    let warnings = 0;
    for (const diagnostic of result.diagnostics) {
      if (diagnostic.severity === 'error') errors++;
      else if (diagnostic.severity === 'warning') warnings++;
    }
    const counts: ProgressCounts = { pages, rebuilt: owners.length, errors, warnings };
    const commit = this.commit;
    if (commit?.status === 'committed' && result.status === 'success') {
      counts.written = commit.written.length;
      counts.removed = commit.removed.length;
      counts.unchanged = Math.max(0, commit.manifest.files.length - commit.written.length);
    }
    // Routes name an edit's pages; a build's summary does not list them.
    if (this.job.trigger !== 'build' && owners.length && snapshot) {
      const routes = rebuiltRoutes(snapshot, owners);
      if (routes.length) counts.routes = routes;
    }
    return counts;
  }
}

/** The routes of the first rebuilt pages, in the compiler's order. */
function rebuiltRoutes(snapshot: ArtifactSnapshot, owners: string[]): string[] {
  const byId = new Map<string, PageArtifact>();
  for (const artifact of snapshot.artifacts) byId.set(artifact.id, artifact);
  const routes: string[] = [];
  for (const owner of owners) {
    const route = pageRoute(byId.get(owner));
    if (route && !routes.includes(route)) routes.push(route);
    if (routes.length === ROUTES) break;
  }
  return routes;
}

/** A page's own route: the shortest route of its content (its tabs add segments). */
function pageRoute(artifact: PageArtifact | undefined): string | undefined {
  let best: string | undefined;
  for (const item of artifact?.content ?? []) {
    const route = item.ir.absoluteRoute;
    if (typeof route === 'string' && (best === undefined || route.length < best.length))
      best = route;
  }
  return best === undefined ? undefined : `/${best.replace(/^\/+/, '')}`;
}
