import type {
  ProgressActivityEvent,
  ProgressCounts,
  ProgressEvent,
  ProgressPass,
  ProgressPhase,
  ProgressSettledEvent,
  ProgressStatus,
  ProgressTrigger,
} from '../../events';
import type { ProgressReporter } from '../../reporter';
import type { FakeClock } from './fake-io';

/**
 * Simulated session feeds. Each scenario is a list of events stamped with
 * the time the session would emit them. The worker's 100 ms coalescing of `advance` updates is
 * applied, as the worker transport does. Costs are illustrative for a large site (≈664 pages,
 * 6,669 files); they are illustrative.
 */
export interface TimedEvent {
  at: number;
  event: ProgressEvent;
}

export interface PhaseSpec {
  phase: ProgressPhase;
  ms: number;
  total?: number;
  pass?: ProgressPass;
  reason?: string;
  reused?: number;
}

export interface GenerationSpec {
  generation: number;
  trigger: ProgressTrigger;
  mode?: 'development' | 'production';
  changes?: number;
  /** Absolute start time (ms). */
  start?: number;
  phases: PhaseSpec[];
  /** Time with no events between `progress-started` and the first phase (a compiler that reports no phases). */
  leadMs?: number;
  /** Time with no events after the last phase and before `settled`. */
  tailMs?: number;
  status: ProgressStatus;
  counts: ProgressCounts;
  /** Coalescing interval for `advance`, as the worker transport sends them. */
  coalesceMs?: number;
  /** Stop after this many events (a superseded generation that never settles). */
  truncateAfter?: number;
}

/** Events of one generation, as the session would emit them. */
export function generation(spec: GenerationSpec): TimedEvent[] {
  const start = spec.start ?? 0;
  const coalesce = spec.coalesceMs ?? 100;
  const events: TimedEvent[] = [];
  let seq = 0;
  let t = spec.leadMs ?? 0;
  const at = (elapsed: number): number => start + elapsed;
  events.push({
    at: start,
    event: {
      kind: 'progress-started',
      generation: spec.generation,
      seq: 0,
      trigger: spec.trigger,
      mode: spec.mode ?? 'development',
      changes: spec.changes ?? 0,
      elapsedMs: 0,
    },
  });
  const phases: Partial<Record<ProgressPhase, number>> = {};
  let pass: ProgressPass | undefined;
  for (const phase of spec.phases) {
    if (phase.pass === 'full' && pass === 'targeted')
      for (const key of Object.keys(phases)) delete phases[key as ProgressPhase];
    pass = phase.pass ?? pass;
    const common = {
      kind: 'progress' as const,
      generation: spec.generation,
      phase: phase.phase,
      ...(phase.pass ? { pass: phase.pass } : {}),
    };
    events.push({
      at: at(t),
      event: {
        ...common,
        seq: ++seq,
        state: 'start',
        completed: 0,
        ...(phase.total !== undefined ? { total: phase.total } : {}),
        ...(phase.reason ? { reason: phase.reason } : {}),
        elapsedMs: t,
      },
    });
    if (phase.total && phase.ms > coalesce) {
      for (let elapsed = coalesce; elapsed < phase.ms; elapsed += coalesce) {
        const completed = Math.floor((phase.total * elapsed) / phase.ms);
        events.push({
          at: at(t + elapsed),
          event: {
            ...common,
            seq: ++seq,
            state: 'advance',
            completed,
            ...(phase.reused !== undefined ? { reused: Math.min(phase.reused, completed) } : {}),
            elapsedMs: t + elapsed,
          },
        });
      }
    }
    t += phase.ms;
    events.push({
      at: at(t),
      event: {
        ...common,
        seq: ++seq,
        state: 'end',
        ...(phase.total !== undefined ? { completed: phase.total } : {}),
        elapsedMs: t,
      },
    });
    phases[phase.phase] = phase.ms;
  }
  t += spec.tailMs ?? 0;
  const settled: ProgressSettledEvent = {
    kind: 'progress-settled',
    generation: spec.generation,
    seq: ++seq,
    status: spec.status,
    elapsedMs: t,
    phases,
    ...(pass ? { pass } : {}),
    ...(spec.phases.find((phase) => phase.reason)?.reason
      ? { reason: spec.phases.find((phase) => phase.reason)!.reason }
      : {}),
    counts: spec.counts,
  };
  events.push({ at: at(t), event: settled });
  return spec.truncateAfter !== undefined ? events.slice(0, spec.truncateAfter) : events;
}

export function activity(
  kind: ProgressActivityEvent['activity'],
  start: number,
  ms: number,
  failed: boolean = false,
): TimedEvent[] {
  return [
    {
      at: start,
      event: { kind: 'progress-activity', activity: kind, state: 'start', elapsedMs: 0 },
    },
    {
      at: start + ms,
      event: {
        kind: 'progress-activity',
        activity: kind,
        state: 'end',
        elapsedMs: ms,
        ...(failed ? { failed } : {}),
      },
    },
  ];
}

/** A large cold build with compiler phases: four steps, ≈20.5 s. */
export const COLD_PHASES: PhaseSpec[] = [
  { phase: 'boot', ms: 800 },
  { phase: 'discovery', ms: 500 },
  { phase: 'semantic', ms: 4_700 },
  { phase: 'plan', ms: 400 },
  { phase: 'describe', ms: 600, total: 664 },
  { phase: 'render', ms: 5_100, total: 664 },
  { phase: 'keywords', ms: 300 },
  { phase: 'link', ms: 2_000, total: 664 },
  { phase: 'assemble', ms: 500, total: 664 },
  { phase: 'aggregate', ms: 300 },
  { phase: 'persist', ms: 1_300, total: 665 },
  { phase: 'transfer', ms: 1_000 },
  { phase: 'commit', ms: 3_000, total: 6_669 },
];

export const COLD_COUNTS: ProgressCounts = {
  pages: 664,
  rebuilt: 664,
  errors: 0,
  warnings: 0,
  written: 6_669,
  removed: 0,
  unchanged: 0,
};

/** Session phases only (the compiler reports none): `transfer` and `commit`. */
export const SESSION_ONLY_PHASES: PhaseSpec[] = [
  { phase: 'transfer', ms: 1_000 },
  { phase: 'commit', ms: 3_000, total: 6_669 },
];

export interface Scenario {
  name: string;
  events: TimedEvent[];
  /** Time to run the clock to after the last event. */
  end: number;
}

const offset = (events: TimedEvent[], by: number): TimedEvent[] =>
  events.map((entry) => ({ ...entry, at: entry.at + by }));

const lastAt = (events: TimedEvent[]): number =>
  events.reduce((max, entry) => Math.max(max, entry.at), 0);

const scenario = (name: string, events: TimedEvent[], extra = 0): Scenario => ({
  name,
  events,
  end: lastAt(events) + extra,
});

export const edit = (
  generationNumber: number,
  start: number,
  overrides: Partial<GenerationSpec> = {},
): TimedEvent[] =>
  generation({
    generation: generationNumber,
    trigger: 'watch',
    changes: 1,
    start,
    phases: [
      { phase: 'semantic', ms: 300, pass: 'targeted' },
      { phase: 'render', ms: 250, total: 1 },
      { phase: 'link', ms: 120, total: 1 },
      { phase: 'transfer', ms: 60 },
      { phase: 'commit', ms: 170, total: 23 },
    ],
    status: 'success',
    counts: {
      pages: 664,
      rebuilt: 1,
      errors: 0,
      warnings: 0,
      written: 23,
      removed: 0,
      unchanged: 6_646,
      routes: ['/getting-started/installation'],
    },
    ...overrides,
  });

/** The named scenarios every golden and harness check replays. */
export const SCENARIOS: Record<string, () => Scenario> = {
  'cold-build': () =>
    scenario(
      'cold-build',
      generation({
        generation: 1,
        trigger: 'build',
        mode: 'production',
        phases: COLD_PHASES,
        status: 'success',
        counts: COLD_COUNTS,
      }),
    ),
  /** The same build three times slower (≈61 s): the byte budget of the live line. */
  'cold-build-60s': () =>
    scenario(
      'cold-build-60s',
      generation({
        generation: 1,
        trigger: 'build',
        mode: 'production',
        phases: COLD_PHASES.map((phase) => ({ ...phase, ms: phase.ms * 3 })),
        status: 'success',
        counts: COLD_COUNTS,
      }),
    ),
  'cold-build-session-only': () =>
    scenario(
      'cold-build-session-only',
      generation({
        generation: 1,
        trigger: 'build',
        mode: 'production',
        leadMs: 16_500,
        phases: SESSION_ONLY_PHASES,
        status: 'success',
        counts: COLD_COUNTS,
      }),
    ),
  'warm-start': () =>
    scenario(
      'warm-start',
      generation({
        generation: 1,
        trigger: 'build',
        phases: [
          { phase: 'boot', ms: 800 },
          { phase: 'discovery', ms: 400 },
          { phase: 'semantic', ms: 4_600 },
          { phase: 'plan', ms: 400 },
          { phase: 'describe', ms: 500, total: 664 },
          { phase: 'render', ms: 100, total: 664, reused: 664 },
          { phase: 'link', ms: 100, total: 664 },
          { phase: 'transfer', ms: 900 },
          { phase: 'commit', ms: 2_000, total: 6_669 },
        ],
        status: 'success',
        counts: {
          pages: 664,
          rebuilt: 0,
          errors: 0,
          warnings: 0,
          written: 0,
          removed: 0,
          unchanged: 6_669,
        },
      }),
    ),
  'failed-build': () =>
    scenario(
      'failed-build',
      generation({
        generation: 1,
        trigger: 'build',
        mode: 'production',
        phases: COLD_PHASES.slice(0, 6).map((phase) =>
          phase.phase === 'render' ? { ...phase, ms: 5_000 } : phase,
        ),
        status: 'failure',
        counts: { pages: 664, rebuilt: 0, errors: 3, warnings: 0 },
      }),
    ),
  'watch-edits': () =>
    scenario('watch-edits', [
      ...edit(2, 0),
      ...edit(3, 25_000, {
        changes: 3,
        counts: {
          pages: 664,
          rebuilt: 3,
          errors: 0,
          warnings: 0,
          written: 61,
          removed: 0,
          unchanged: 6_608,
          routes: [
            '/api/core/functions/asArray',
            '/api/core/functions/isPresent',
            '/api/core/functions/objectKeys',
          ],
        },
      }),
      // An unchanged save: nothing rebuilt, nothing written.
      ...edit(4, 40_000, {
        counts: {
          pages: 664,
          rebuilt: 0,
          errors: 0,
          warnings: 0,
          written: 0,
          removed: 0,
          unchanged: 6_669,
        },
      }),
      // A superseded generation: committed, then a newer one follows.
      ...edit(5, 50_000, { status: 'superseded' }),
      ...edit(6, 51_000),
    ]),
  'slow-full-edit': () =>
    scenario(
      'slow-full-edit',
      generation({
        generation: 2,
        trigger: 'watch',
        changes: 1,
        phases: [
          { phase: 'semantic', ms: 200, pass: 'targeted' },
          { phase: 'discovery', ms: 300, pass: 'full', reason: 'tsconfig.json changed' },
          { phase: 'semantic', ms: 2_900 },
          { phase: 'render', ms: 2_100, total: 664 },
          { phase: 'link', ms: 800, total: 664 },
          { phase: 'transfer', ms: 100 },
          { phase: 'commit', ms: 400, total: 6_669 },
        ],
        status: 'success',
        counts: {
          pages: 664,
          rebuilt: 664,
          errors: 0,
          warnings: 0,
          written: 120,
          removed: 0,
          unchanged: 6_549,
        },
      }),
    ),
  'failed-edit': () =>
    scenario('failed-edit', [
      ...edit(2, 0, {
        status: 'failure',
        counts: { pages: 664, rebuilt: 0, errors: 1, warnings: 0 },
      }),
      ...edit(3, 20_000, {
        status: 'failure',
        counts: { pages: 664, rebuilt: 0, errors: 1, warnings: 0 },
      }),
    ]),
  background: () =>
    scenario('background', [
      ...activity('checking-inputs', 0, 400),
      ...activity('warming-up', 500, 9_500),
      // A fast idle confirmation: hidden.
      ...offset(
        generation({
          generation: 2,
          trigger: 'confirmation',
          phases: [
            { phase: 'transfer', ms: 300 },
            { phase: 'commit', ms: 400, total: 2 },
          ],
          status: 'success',
          counts: {
            pages: 664,
            rebuilt: 1,
            errors: 0,
            warnings: 0,
            written: 2,
            removed: 0,
            unchanged: 6_667,
          },
        }),
        12_000,
      ),
      // A slow audit that restores files: shown after 2 s.
      ...offset(
        generation({
          generation: 3,
          trigger: 'audit',
          phases: [
            { phase: 'transfer', ms: 500 },
            { phase: 'commit', ms: 2_600, total: 6_669 },
          ],
          status: 'success',
          counts: {
            pages: 664,
            rebuilt: 0,
            errors: 0,
            warnings: 0,
            written: 2,
            removed: 0,
            unchanged: 6_667,
          },
        }),
        20_000,
      ),
      // A failing follow-up: always shown.
      ...offset(
        generation({
          generation: 4,
          trigger: 'follow-up',
          changes: 1,
          phases: [{ phase: 'transfer', ms: 200 }],
          status: 'failure',
          counts: { pages: 664, rebuilt: 0, errors: 2, warnings: 0 },
        }),
        30_000,
      ),
    ]),
  /** Generation 3 is superseded before it settles; its late events must be ignored. */
  supersession: () => {
    const three = generation({
      generation: 3,
      trigger: 'build',
      phases: COLD_PHASES,
      status: 'cancelled',
      counts: COLD_COUNTS,
    });
    const cut = three.findIndex((entry) => entry.at >= 9_000);
    const four = offset(
      generation({
        generation: 4,
        trigger: 'build',
        phases: COLD_PHASES,
        status: 'success',
        counts: COLD_COUNTS,
      }),
      9_000,
    );
    // Late tail of generation 3 (an advance and its cancelled settle) after 4 started.
    const late = three.slice(cut, cut + 3).map((entry) => ({ ...entry, at: 9_050 }));
    return scenario('supersession', [...three.slice(0, cut), four[0], ...late, ...four.slice(1)]);
  },
};

/**
 * The legacy engine's update cadence on a 1000-page fixture: 12,128 updates. Replayed uncoalesced over 60 s through
 * one render phase, it must still produce a bounded log.
 */
export function legacyCadence(updates: number = 12_128, durationMs: number = 60_000): Scenario {
  const events: TimedEvent[] = [
    {
      at: 0,
      event: {
        kind: 'progress-started',
        generation: 1,
        seq: 0,
        trigger: 'build',
        mode: 'development',
        changes: 0,
        elapsedMs: 0,
      },
    },
    {
      at: 0,
      event: {
        kind: 'progress',
        generation: 1,
        seq: 1,
        phase: 'render',
        state: 'start',
        completed: 0,
        total: updates,
        elapsedMs: 0,
      },
    },
  ];
  for (let index = 1; index <= updates; index++) {
    const t = Math.floor((index * durationMs) / (updates + 1));
    events.push({
      at: t,
      event: {
        kind: 'progress',
        generation: 1,
        seq: index + 1,
        phase: 'render',
        state: 'advance',
        completed: index,
        total: updates,
        elapsedMs: t,
      },
    });
  }
  events.push({
    at: durationMs,
    event: {
      kind: 'progress',
      generation: 1,
      seq: updates + 2,
      phase: 'render',
      state: 'end',
      completed: updates,
      elapsedMs: durationMs,
    },
  });
  events.push({
    at: durationMs,
    event: {
      kind: 'progress-settled',
      generation: 1,
      seq: updates + 3,
      status: 'success',
      elapsedMs: durationMs,
      phases: { render: durationMs },
      counts: { pages: 1_000, rebuilt: 1_000, errors: 0, warnings: 0, written: 3_000 },
    },
  });
  return { name: 'legacy-g1000', events, end: durationMs };
}

/** Replays a scenario against a reporter on a fake clock (instant). */
export function replay(
  scenario: Scenario,
  reporter: ProgressReporter,
  clock: FakeClock,
  hooks: Array<{ at?: number; run: () => void }> = [],
): void {
  const pending = [...hooks].sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
  for (const entry of [...scenario.events].sort((a, b) => a.at - b.at)) {
    while (pending.length && (pending[0].at ?? 0) <= entry.at) {
      const hook = pending.shift()!;
      clock.advanceTo(hook.at ?? 0);
      hook.run();
    }
    clock.advanceTo(entry.at);
    reporter.handle(entry.event);
  }
  for (const hook of pending) {
    clock.advanceTo(hook.at ?? 0);
    hook.run();
  }
  clock.advanceTo(scenario.end);
}

/** Replays in real time (scaled), for child processes under a PTY or a pipe. */
export async function replayRealTime(
  scenario: Scenario,
  reporter: ProgressReporter,
  scale: number = 1,
): Promise<void> {
  const started = performance.now();
  for (const entry of [...scenario.events].sort((a, b) => a.at - b.at)) {
    const wait = entry.at * scale - (performance.now() - started);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    reporter.handle(entry.event);
  }
}
