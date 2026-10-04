import type {
  ProgressActivityEvent,
  ProgressEvent,
  ProgressPass,
  ProgressPhase,
  ProgressSettledEvent,
  ProgressState,
  ProgressTrigger,
} from './events';
import { plainText, PROGRESS_PHASES, PROGRESS_TRIGGERS, SESSION_PHASES } from './events';

/** The four user-facing steps; each groups the internal phases that run in it. */
export interface ProgressStep {
  label: 'preparing' | 'rendering' | 'linking' | 'writing';
  phases: readonly ProgressPhase[];
}

export const PROGRESS_STEPS: readonly ProgressStep[] = Object.freeze([
  { label: 'preparing', phases: ['boot', 'discovery', 'restore', 'semantic', 'plan', 'describe'] },
  { label: 'rendering', phases: ['render', 'keywords'] },
  { label: 'linking', phases: ['link', 'assemble', 'aggregate'] },
  { label: 'writing', phases: ['persist', 'transfer', 'commit'] },
] as const);

const STEP_OF = new Map<ProgressPhase, number>(
  PROGRESS_STEPS.flatMap((step, index) => step.phases.map((phase) => [phase, index] as const)),
);

/** Zero-based index of the step a phase belongs to. */
export const stepOf = (phase: ProgressPhase): number => STEP_OF.get(phase) ?? 0;

/**
 * Default share of a cold build per phase (preparing ≈35 %, rendering ≈25 %, linking ≈15 %,
 * writing ≈25 % on a large site). They only drive the percentage, never results.
 */
export const PHASE_WEIGHTS: Readonly<Record<ProgressPhase, number>> = Object.freeze({
  boot: 0.04,
  discovery: 0.02,
  // The fast start's check: it either ends the compilation or precedes all of it.
  restore: 0,
  semantic: 0.21,
  plan: 0.03,
  describe: 0.05,
  render: 0.23,
  keywords: 0.02,
  link: 0.1,
  assemble: 0.03,
  aggregate: 0.02,
  persist: 0.06,
  transfer: 0.05,
  commit: 0.14,
});

const ORDER = new Map<ProgressPhase, number>(PROGRESS_PHASES.map((phase, index) => [phase, index]));
const CUMULATIVE = PROGRESS_PHASES.map((_, index) =>
  PROGRESS_PHASES.slice(0, index).reduce((sum, phase) => sum + PHASE_WEIGHTS[phase], 0),
);

/** What the model knows about one generation. */
export interface GenerationView {
  generation: number;
  trigger: ProgressTrigger;
  mode: 'development' | 'production';
  changes: number;
  /** Session clock of the newest accepted event. */
  elapsedMs: number;
  lastSeq: number;
  pass?: ProgressPass;
  reason?: string;
  /** The phase sequence restarted once for a FULL pass. */
  restarted: boolean;
  phase?: ProgressPhase;
  phaseState?: ProgressState;
  completed?: number;
  /** Totals fixed at each phase's start, in the current pass. */
  totals: Partial<Record<ProgressPhase, number>>;
  reused?: number;
  /** Compiler phases are reported, so the four steps and a percentage can be shown. */
  stepped: boolean;
  /** Weighted overall fraction, clamped so the percentage never goes backwards. */
  fraction: number;
  settled?: ProgressSettledEvent;
}

export type ModelChange =
  | { kind: 'started'; view: GenerationView; superseded?: GenerationView }
  | { kind: 'progress'; view: GenerationView; phaseStarted: boolean; passRestarted: boolean }
  | { kind: 'settled'; view: GenerationView; event: ProgressSettledEvent }
  | { kind: 'activity'; event: ProgressActivityEvent };

/** Free text as one safe, trimmed line; `undefined` when empty or not a string. */
const text = (value: unknown): string | undefined =>
  typeof value === 'string' ? plainText(value).trim() || undefined : undefined;

const count = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : undefined;

/**
 * The generation-scoped progress state: one start, strictly increasing `seq`, one settle; phases in
 * declared order; fixed totals and monotonic counts. Only the newest started generation
 * is tracked. Stale, out-of-order and malformed events are dropped (`apply` returns `undefined`);
 * nothing throws.
 */
export class ProgressModel {
  private latest = Number.NEGATIVE_INFINITY;
  private currentView: GenerationView | undefined;
  /** Running activities, per kind: a warm-up and an input check may overlap. */
  private readonly activities = new Set<ProgressActivityEvent['activity']>();
  /** Sticky: once any generation reported a compiler phase, later generations are stepped. */
  private compilerReports = false;

  get current(): GenerationView | undefined {
    return this.currentView;
  }

  /** A generation has started and not settled. */
  get inFlight(): boolean {
    return !!this.currentView && !this.currentView.settled;
  }

  apply(event: ProgressEvent): ModelChange | undefined {
    if (!event || typeof event !== 'object') return undefined;
    switch (event.kind) {
      case 'progress-started':
        return this.started(event);
      case 'progress':
        return this.progress(event);
      case 'progress-settled':
        return this.settled(event);
      case 'progress-activity':
        return this.activityChange(event);
      default:
        return undefined;
    }
  }

  private started(
    event: Extract<ProgressEvent, { kind: 'progress-started' }>,
  ): ModelChange | undefined {
    if (!Number.isFinite(event.generation) || event.generation <= this.latest) return undefined;
    if (event.seq !== 0 || !PROGRESS_TRIGGERS.includes(event.trigger)) return undefined;
    const superseded = this.inFlight ? this.currentView : undefined;
    this.latest = event.generation;
    this.currentView = {
      generation: event.generation,
      trigger: event.trigger,
      mode: event.mode === 'production' ? 'production' : 'development',
      changes: count(event.changes) ?? 0,
      elapsedMs: 0,
      lastSeq: 0,
      restarted: false,
      totals: {},
      stepped: this.compilerReports,
      fraction: 0,
    };
    return { kind: 'started', view: this.currentView, ...(superseded ? { superseded } : {}) };
  }

  /** The view when `event` belongs to the in-flight generation and advances its `seq`. */
  private accepting(event: {
    generation: number;
    seq: number;
    elapsedMs: number;
  }): GenerationView | undefined {
    const view = this.currentView;
    if (!view || view.settled || event.generation !== view.generation) return undefined;
    if (!Number.isFinite(event.seq) || event.seq <= view.lastSeq) return undefined;
    return view;
  }

  private progress(event: Extract<ProgressEvent, { kind: 'progress' }>): ModelChange | undefined {
    const view = this.accepting(event);
    const index = ORDER.get(event.phase);
    if (!view || index === undefined) return undefined;
    if (event.state !== 'start' && event.state !== 'advance' && event.state !== 'end')
      return undefined;
    let passRestarted = false;
    if (event.pass !== undefined && event.pass !== view.pass) {
      // A targeted pass may fall back to FULL once, inside the same generation; the phases restart.
      if (view.pass === 'targeted' && event.pass === 'full') {
        if (event.state !== 'start') return undefined;
        passRestarted = true;
      } else if (view.pass !== undefined) return undefined;
    }
    const current = passRestarted || view.phase === undefined ? -1 : ORDER.get(view.phase)!;
    if (event.state === 'start') {
      if (index <= current) return undefined;
    } else if (index !== current || view.phaseState === 'end') return undefined;
    // Accepted: update the view.
    view.lastSeq = event.seq;
    view.elapsedMs = Math.max(view.elapsedMs, count(event.elapsedMs) ?? view.elapsedMs);
    if (event.pass !== undefined) view.pass = event.pass;
    if (passRestarted) {
      view.restarted = true;
      view.totals = {};
    }
    const reason = text(event.reason);
    if (event.pass === 'full' && reason) view.reason = reason;
    if (!SESSION_PHASES.has(event.phase)) {
      this.compilerReports = true;
      view.stepped = true;
    }
    const total = view.totals[event.phase];
    if (event.state === 'start') {
      view.phase = event.phase;
      view.reused = undefined;
      const fixed = count(event.total);
      if (fixed !== undefined) view.totals[event.phase] = fixed;
      view.completed = Math.min(count(event.completed) ?? 0, fixed ?? Number.POSITIVE_INFINITY);
    } else {
      const next = Math.max(view.completed ?? 0, count(event.completed) ?? 0);
      view.completed =
        event.state === 'end' && total !== undefined ? total : Math.min(next, total ?? next);
    }
    view.phaseState = event.state;
    const reused = count(event.reused);
    if (reused !== undefined) view.reused = Math.min(reused, view.completed);
    const phaseTotal = view.totals[event.phase];
    const within =
      event.state === 'end' ? 1 : phaseTotal ? Math.min(1, (view.completed ?? 0) / phaseTotal) : 0;
    const fraction = CUMULATIVE[index] + PHASE_WEIGHTS[event.phase] * within;
    view.fraction = Math.min(1, Math.max(view.fraction, fraction));
    return { kind: 'progress', view, phaseStarted: event.state === 'start', passRestarted };
  }

  private settled(raw: ProgressSettledEvent): ModelChange | undefined {
    const view = this.accepting(raw);
    if (!view) return undefined;
    // The settle carries the result line: a malformed one is dropped rather than printed as NaN.
    const event = validSettled(raw);
    if (!event) return undefined;
    view.lastSeq = event.seq;
    view.elapsedMs = Math.max(view.elapsedMs, event.elapsedMs);
    if (event.pass !== undefined) view.pass = event.pass;
    if (event.reason) view.reason = event.reason;
    if (event.status === 'success') view.fraction = 1;
    view.settled = event;
    return { kind: 'settled', view, event };
  }

  /**
   * Activities are tracked per kind and are accepted during a generation too: the session does
   * not run them inside one, but a failure must never be lost to an ordering surprise. An `end`
   * without a matching `start` is dropped, unless it reports a failure.
   */
  private activityChange(event: ProgressActivityEvent): ModelChange | undefined {
    if (event.activity !== 'checking-inputs' && event.activity !== 'warming-up') return undefined;
    if (event.state === 'start') this.activities.add(event.activity);
    else if (
      event.state === 'end' &&
      (this.activities.delete(event.activity) || event.failed === true)
    ) {
      // Accepted.
    } else return undefined;
    return { kind: 'activity', event };
  }
}

const STATUSES: ReadonlySet<string> = new Set(['success', 'superseded', 'failure', 'cancelled']);
const PASSES: ReadonlySet<string> = new Set(['targeted', 'full', 'restored']);

/** A copy of `event` with checked numbers, or `undefined` when it is malformed. */
function validSettled(event: ProgressSettledEvent): ProgressSettledEvent | undefined {
  if (!STATUSES.has(event.status)) return undefined;
  const elapsedMs = count(event.elapsedMs);
  const counts = event.counts as Partial<ProgressSettledEvent['counts']> | undefined;
  if (elapsedMs === undefined || !counts || typeof counts !== 'object') return undefined;
  const pages = count(counts.pages);
  const rebuilt = count(counts.rebuilt);
  const errors = count(counts.errors);
  const warnings = count(counts.warnings);
  if (
    pages === undefined ||
    rebuilt === undefined ||
    errors === undefined ||
    warnings === undefined
  )
    return undefined;
  const checked: ProgressSettledEvent['counts'] = { pages, rebuilt, errors, warnings };
  for (const key of ['written', 'removed', 'unchanged'] as const) {
    if (counts[key] === undefined) continue;
    const value = count(counts[key]);
    if (value === undefined) return undefined;
    checked[key] = value;
  }
  if (counts.routes !== undefined) {
    if (!Array.isArray(counts.routes) || counts.routes.some((route) => typeof route !== 'string'))
      return undefined;
    checked.routes = counts.routes.map(plainText).slice(0, 3);
  }
  const phases: ProgressSettledEvent['phases'] = {};
  if (event.phases && typeof event.phases === 'object')
    for (const phase of ORDER.keys()) {
      const value = count(event.phases[phase]);
      if (value !== undefined) phases[phase] = value;
    }
  const reason = text(event.reason);
  return {
    kind: 'progress-settled',
    generation: event.generation,
    seq: event.seq,
    status: event.status,
    elapsedMs,
    phases,
    ...(event.pass !== undefined && PASSES.has(event.pass) ? { pass: event.pass } : {}),
    ...(reason ? { reason } : {}),
    counts: checked,
  };
}
