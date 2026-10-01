import type { CompilationProgressUpdate, Diagnostic, Generation } from '../contracts';

export type { CompilationPhase } from '../contracts';

/** Every phase a generation can report: the compilation's (compiler and worker) and the commit. */
export type ProgressPhase = CompilationProgressUpdate['phase'] | 'commit';

/** Declared execution order. A phase may be skipped but never goes backwards. */
export const PROGRESS_PHASES: readonly ProgressPhase[] = Object.freeze([
  'boot',
  'discovery',
  'restore',
  'semantic',
  'plan',
  'describe',
  'render',
  'keywords',
  'link',
  'assemble',
  'aggregate',
  'persist',
  'transfer',
  'commit',
]);

/**
 * Phases reported outside the compiler: the worker runtime's start and result transfer, and the
 * session's commit. Only compiler phases make the output show steps.
 */
export const SESSION_PHASES: ReadonlySet<ProgressPhase> = new Set(['boot', 'transfer', 'commit']);

/** Why a generation runs. It selects how much the reporter prints. */
export type ProgressTrigger =
  /** `buildOnce`: the initial development build or a production build. Full progress. */
  | 'build'
  /** A filesystem generation, including the first watch generation when the baseline is not reused. */
  | 'watch'
  /** A watcher rescan or a reconcile-origin generation. */
  | 'rescan'
  /** A generation started by an idle sweep for missed changes. Background. */
  | 'follow-up'
  /** The idle FULL confirmation after a targeted pass failed. Background. */
  | 'confirmation'
  /** The idle audit that repairs generated files changed outside NgDoc. Background. */
  | 'audit';

export const PROGRESS_TRIGGERS: readonly ProgressTrigger[] = Object.freeze([
  'build',
  'watch',
  'rescan',
  'follow-up',
  'confirmation',
  'audit',
]);

/** Background work is hidden unless it fails, runs longer than 2 s, or clears a reported error. */
export const BACKGROUND_TRIGGERS: ReadonlySet<ProgressTrigger> = new Set([
  'follow-up',
  'confirmation',
  'audit',
]);

/** `restored`: a start published its recorded candidate without compiling (the fast start). */
export type ProgressPass = 'targeted' | 'full' | 'restored';
export type ProgressState = 'start' | 'advance' | 'end';

/**
 * `superseded`: the generation committed, was adopted and a newer one follows (a `success` with
 * `superseded: true` in `BuildResult`). `cancelled`: nothing was committed.
 */
export type ProgressStatus = 'success' | 'superseded' | 'failure' | 'cancelled';

export interface ProgressCounts {
  /** Pages (units) in the candidate. */
  pages: number;
  /** Unique pages rebuilt in this generation (`whyRebuilt` owners). */
  rebuilt: number;
  errors: number;
  warnings: number;
  /** Output files written, removed and left unchanged by the commit. */
  written?: number;
  removed?: number;
  unchanged?: number;
  /** At most three routes of rebuilt pages, for the per-edit line. */
  routes?: string[];
}

export interface ProgressStartedEvent {
  kind: 'progress-started';
  generation: Generation;
  seq: 0;
  trigger: ProgressTrigger;
  mode: 'development' | 'production';
  /** File changes (or requested ids) behind the generation. */
  changes: number;
  elapsedMs: 0;
}

export interface ProgressUpdateEvent {
  kind: 'progress';
  generation: Generation;
  /** Strictly increasing within the generation; assigned by the session. */
  seq: number;
  phase: ProgressPhase;
  state: ProgressState;
  /** Non-decreasing within `(pass, phase)`; never above `total`. */
  completed?: number;
  /** Fixed at `start`. */
  total?: number;
  /** Render: units reused from the previous IR or the cache. */
  reused?: number;
  /** A change to `full` may restart the phase sequence once per generation. */
  pass?: ProgressPass;
  /** On a pass change to `full`: a short, user-safe reason. */
  reason?: string;
  /** Session clock (`performance.now()`), milliseconds since `progress-started`. */
  elapsedMs: number;
}

export interface ProgressSettledEvent {
  kind: 'progress-settled';
  generation: Generation;
  seq: number;
  status: ProgressStatus;
  elapsedMs: number;
  /** Milliseconds per phase that ran (last pass). */
  phases: Partial<Record<ProgressPhase, number>>;
  pass?: ProgressPass;
  reason?: string;
  counts: ProgressCounts;
}

/** Work outside a generation: the input check after start (`reobserve`) and the warm-up (`prime`). */
export interface ProgressActivityEvent {
  kind: 'progress-activity';
  activity: 'checking-inputs' | 'warming-up';
  state: 'start' | 'end';
  /** Only on `end`: the activity failed. */
  failed?: boolean;
  /** Only on `end`: other work stopped the activity before it finished. */
  stopped?: boolean;
  elapsedMs: number;
}

/** Advisory only: never influences results, commits, retention, watch inputs or caching. */
export type ProgressEvent =
  | ProgressStartedEvent
  | ProgressUpdateEvent
  | ProgressSettledEvent
  | ProgressActivityEvent;

/**
 * Free text from the session (routes, reasons) and hosts (project names) as one safe line: C0 and
 * C1 controls (newlines, escape sequences) and the Unicode line separators become spaces, so the
 * text can neither start a new log line (`::error::`) nor drive the terminal (OSC, cursor moves).
 */
export const plainText = (text: string): string =>
  // Control characters are exactly what this replaces.
  // eslint-disable-next-line no-control-regex
  text.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, ' ');

/** A consumer of progress events (`SessionOptions.onProgress`). */
export type ProgressSink = (event: ProgressEvent) => void | Promise<void>;

/**
 * Warning code for a progress consumer that threw or rejected. Reported once per session and never
 * stops the watch: progress is advisory and must never change a build's outcome.
 */
export const SESSION_PROGRESS_FAILED = 'SESSION_PROGRESS_FAILED';

/** The `SESSION_PROGRESS_FAILED` diagnostic. Its severity is always `warning`. */
export function progressFailure(error: unknown): Diagnostic {
  return {
    code: SESSION_PROGRESS_FAILED,
    severity: 'warning',
    stage: 'host',
    message: `Progress reporting failed and was skipped: ${describe(error)}`,
  };
}

/**
 * Wraps a progress consumer so that it can never throw into its caller. The first synchronous
 * exception or rejection is reported once through `report` (as `SESSION_PROGRESS_FAILED`); later
 * failures are swallowed. Events keep flowing to the consumer, and nothing else changes.
 */
export function guardProgressSink(
  sink: ProgressSink,
  report: (diagnostic: Diagnostic) => void,
): (event: ProgressEvent) => void {
  let reported = false;
  const fail = (error: unknown): void => {
    if (reported) return;
    reported = true;
    try {
      report(progressFailure(error));
    } catch {
      /* A failing diagnostic consumer must not break the generation either. */
    }
  };
  return (event) => {
    try {
      const pending = sink(event);
      if (pending && typeof pending.then === 'function') pending.then(undefined, fail);
    } catch (error) {
      fail(error);
    }
  };
}

function describe(error: unknown): string {
  try {
    return error instanceof Error ? error.message : String(error);
  } catch {
    return 'Unknown error';
  }
}
