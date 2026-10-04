import { describe, expect, it } from 'vitest';

import type {
  ProgressEvent,
  ProgressPhase,
  ProgressStartedEvent,
  ProgressUpdateEvent,
} from '../events';
import { PROGRESS_PHASES } from '../events';
import { PHASE_WEIGHTS, PROGRESS_STEPS, ProgressModel, stepOf } from '../model';
import { COLD_COUNTS, COLD_PHASES, generation, SCENARIOS } from './harness/simulate';

const started = (
  generationNumber: number,
  trigger: 'build' | 'watch' = 'build',
): ProgressStartedEvent => ({
  kind: 'progress-started',
  generation: generationNumber,
  seq: 0,
  trigger,
  mode: 'development',
  changes: 2,
  elapsedMs: 0,
});

const update = (
  seq: number,
  phase: ProgressPhase,
  state: 'start' | 'advance' | 'end',
  extra: Partial<ProgressUpdateEvent> = {},
): ProgressUpdateEvent => ({
  kind: 'progress',
  generation: 1,
  seq,
  phase,
  state,
  elapsedMs: seq * 10,
  ...extra,
});

/** Seeded PRNG (mulberry32) so the property checks are reproducible. */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('steps and weights', () => {
  it('cover every phase once, in declared order, and sum to 1', () => {
    expect(PROGRESS_STEPS.flatMap((step) => step.phases)).toEqual(PROGRESS_PHASES);
    expect(Object.values(PHASE_WEIGHTS).reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(
      1,
      10,
    );
    expect(stepOf('boot')).toBe(0);
    expect(stepOf('keywords')).toBe(1);
    expect(stepOf('aggregate')).toBe(2);
    expect(stepOf('commit')).toBe(3);
    expect(stepOf('nope' as ProgressPhase)).toBe(0);
  });
});

describe('ProgressModel', () => {
  it('accepts a whole simulated generation and ends at 100 %', () => {
    const model = new ProgressModel();
    const events = generation({
      generation: 1,
      trigger: 'build',
      phases: COLD_PHASES,
      status: 'success',
      counts: COLD_COUNTS,
    });
    expect(events.every((entry) => model.apply(entry.event))).toBe(true);
    expect(model.current?.fraction).toBe(1);
    expect(model.inFlight).toBe(false);
    expect(model.current?.stepped).toBe(true);
  });

  it('drops stale generations, repeated seq and events after settle', () => {
    const model = new ProgressModel();
    expect(model.apply(update(1, 'boot', 'start'))).toBeUndefined(); // before any start
    expect(model.apply(started(2))?.kind).toBe('started');
    expect(model.apply(started(2))).toBeUndefined();
    expect(model.apply(started(1))).toBeUndefined();
    expect(model.apply({ ...started(3), seq: 1 as 0 })).toBeUndefined();
    expect(model.apply({ ...started(3), trigger: 'nope' as 'build' })).toBeUndefined();
    expect(model.apply({ ...update(1, 'boot', 'start'), generation: 2 })?.kind).toBe('progress');
    expect(model.apply({ ...update(1, 'boot', 'end'), generation: 2 })).toBeUndefined(); // seq not increasing
    expect(model.apply({ ...update(2, 'boot', 'end'), generation: 1 })).toBeUndefined(); // other generation
    const settled = {
      kind: 'progress-settled',
      generation: 2,
      seq: 3,
      status: 'success',
      elapsedMs: 50,
      phases: {},
      counts: COLD_COUNTS,
    } as const;
    expect(model.apply({ ...settled, status: 'weird' as 'success' })).toBeUndefined();
    expect(model.apply(settled)?.kind).toBe('settled');
    expect(model.apply({ ...settled, seq: 4 })).toBeUndefined();
    expect(model.apply({ ...update(5, 'commit', 'start'), generation: 2 })).toBeUndefined();
    expect(model.apply({ kind: 'nope' } as unknown as ProgressEvent)).toBeUndefined();
    expect(model.apply(undefined as unknown as ProgressEvent)).toBeUndefined();
  });

  it('reports the in-flight generation as superseded when a newer one starts', () => {
    const model = new ProgressModel();
    model.apply(started(1));
    const change = model.apply(started(2));
    expect(change).toMatchObject({ kind: 'started', superseded: { generation: 1 } });
    expect(model.current?.generation).toBe(2);
  });

  it('enforces phase order: skips allowed, no repeats, no nesting', () => {
    const model = new ProgressModel();
    model.apply(started(1));
    expect(model.apply(update(1, 'semantic', 'start'))).toBeDefined(); // boot and discovery skipped
    expect(model.apply(update(2, 'discovery', 'start'))).toBeUndefined(); // backwards
    expect(model.apply(update(3, 'semantic', 'start'))).toBeUndefined(); // repeat
    expect(model.apply(update(4, 'render', 'advance'))).toBeUndefined(); // not started
    expect(model.apply(update(5, 'semantic', 'end'))).toBeDefined();
    expect(model.apply(update(6, 'semantic', 'advance'))).toBeUndefined(); // after end
    expect(model.apply(update(7, 'nope' as ProgressPhase, 'start'))).toBeUndefined();
    expect(model.apply(update(8, 'render', 'bogus' as 'start'))).toBeUndefined();
  });

  it('fixes totals at start and keeps completed monotonic and bounded', () => {
    const model = new ProgressModel();
    model.apply(started(1));
    model.apply(update(1, 'render', 'start', { total: 10, completed: 50 }));
    expect(model.current?.completed).toBe(10);
    model.apply(update(2, 'render', 'advance', { completed: 3, total: 99 }));
    expect(model.current?.totals.render).toBe(10);
    expect(model.current?.completed).toBe(10);
    const other = new ProgressModel();
    other.apply(started(1));
    other.apply(update(1, 'render', 'start', { total: 10 }));
    other.apply(update(2, 'render', 'advance', { completed: 6, reused: 9 }));
    expect(other.current?.completed).toBe(6);
    expect(other.current?.reused).toBe(6);
    other.apply(update(3, 'render', 'advance', { completed: 4 }));
    expect(other.current?.completed).toBe(6);
    other.apply(update(4, 'render', 'advance', { completed: Number.NaN, elapsedMs: -5 }));
    expect(other.current?.completed).toBe(6);
    other.apply(update(5, 'render', 'end'));
    expect(other.current?.completed).toBe(10);
    // A phase without a total: completed is still monotonic.
    other.apply(update(6, 'link', 'start'));
    other.apply(update(7, 'link', 'advance', { completed: 5 }));
    other.apply(update(8, 'link', 'end', { completed: 2 }));
    expect(other.current?.completed).toBe(5);
  });

  it('restarts the phases once when a targeted pass falls back to FULL', () => {
    const model = new ProgressModel();
    model.apply(started(1, 'watch'));
    expect(model.apply(update(1, 'semantic', 'start', { pass: 'targeted' }))).toBeDefined();
    model.apply(update(2, 'render', 'start', { total: 2 }));
    const fractionBefore = model.current!.fraction;
    expect(
      model.apply(update(3, 'render', 'advance', { pass: 'full', completed: 1 })),
    ).toBeUndefined(); // must be a start
    const restart = model.apply(
      update(4, 'discovery', 'start', { pass: 'full', reason: ' tsconfig.json changed ' }),
    );
    expect(restart).toMatchObject({ kind: 'progress', passRestarted: true });
    expect(model.current).toMatchObject({
      pass: 'full',
      restarted: true,
      reason: 'tsconfig.json changed',
      totals: {},
    });
    expect(model.current!.fraction).toBeGreaterThanOrEqual(fractionBefore); // clamped: never backwards
    // Only once, and never back to targeted.
    expect(model.apply(update(5, 'boot', 'start', { pass: 'targeted' }))).toBeUndefined();
    expect(model.apply(update(6, 'semantic', 'start'))).toBeDefined();
    // A declared FULL pass (no fallback) does not count as a restart.
    const full = new ProgressModel();
    full.apply(started(1));
    full.apply(update(1, 'boot', 'start'));
    expect(
      full.apply(
        update(2, 'discovery', 'start', { pass: 'full', reason: 'NGDOC_TARGETED_REBUILD=0' }),
      ),
    ).toMatchObject({ passRestarted: false });
    expect(full.current).toMatchObject({ restarted: false, reason: 'NGDOC_TARGETED_REBUILD=0' });
  });

  it('takes the restored pass of a fast start and keeps it on the settle', () => {
    const model = new ProgressModel();
    model.apply(started(1));
    model.apply(update(1, 'discovery', 'start'));
    model.apply(update(2, 'restore', 'start'));
    expect(model.apply(update(3, 'restore', 'end', { pass: 'restored' }))).toBeDefined();
    expect(model.current).toMatchObject({ pass: 'restored', restarted: false, stepped: true });
    // Neither a targeted nor a full pass follows a restored one.
    expect(model.apply(update(4, 'semantic', 'start', { pass: 'full' }))).toBeUndefined();
    const settle = model.apply({
      kind: 'progress-settled',
      generation: 1,
      seq: 5,
      status: 'success',
      elapsedMs: 3_300,
      phases: { restore: 700 },
      pass: 'restored',
      counts: { pages: 2, rebuilt: 0, errors: 0, warnings: 0 },
    });
    expect(settle).toMatchObject({ kind: 'settled', event: { pass: 'restored' } });
  });

  it('marks generations stepped once the compiler reports, and remembers it', () => {
    const model = new ProgressModel();
    model.apply(started(1));
    model.apply(update(1, 'transfer', 'start'));
    expect(model.current?.stepped).toBe(false);
    model.apply(update(2, 'commit', 'start', { total: 5 }));
    expect(model.current?.stepped).toBe(false);
    model.apply(started(2));
    expect(model.current?.stepped).toBe(false);
    model.apply({ ...update(1, 'render', 'start'), generation: 2 });
    expect(model.current?.stepped).toBe(true);
    model.apply(started(3));
    expect(model.current?.stepped).toBe(true);
  });

  it('tracks activity per kind, inside and outside generations', () => {
    const model = new ProgressModel();
    const start = {
      kind: 'progress-activity',
      activity: 'warming-up',
      state: 'start',
      elapsedMs: 0,
    } as const;
    expect(model.apply({ ...start, state: 'end' })).toBeUndefined();
    expect(model.apply(start)?.kind).toBe('activity');
    expect(model.apply({ ...start, activity: 'checking-inputs', state: 'end' })).toBeUndefined();
    expect(model.apply({ ...start, state: 'end' })?.kind).toBe('activity');
    expect(model.apply({ ...start, activity: 'nope' as 'warming-up' })).toBeUndefined();
    expect(model.apply({ ...start, state: 'bogus' as 'start' })).toBeUndefined();
    // Per kind: an input check does not end a warm-up, and both may run at once.
    expect(model.apply(start)?.kind).toBe('activity');
    expect(model.apply({ ...start, activity: 'checking-inputs' })?.kind).toBe('activity');
    expect(model.apply({ ...start, activity: 'checking-inputs', state: 'end' })?.kind).toBe(
      'activity',
    );
    // Accepted during a generation too, so a failure is never lost.
    model.apply(started(1));
    expect(model.apply({ ...start, state: 'end', failed: true })?.kind).toBe('activity');
    // A failed end without a start still counts; a plain one does not.
    expect(model.apply({ ...start, state: 'end', failed: true })?.kind).toBe('activity');
    expect(model.apply({ ...start, state: 'end' })).toBeUndefined();
  });

  it('drops a malformed settle instead of printing NaN', () => {
    const good = {
      kind: 'progress-settled',
      generation: 1,
      seq: 1,
      status: 'success',
      elapsedMs: 400,
      phases: { commit: 100, render: Number.NaN, nope: 5 } as never,
      pass: 'sideways' as never,
      reason: '  ',
      counts: { pages: 3, rebuilt: 1, errors: 0, warnings: 0, routes: ['/a', '/b', '/c', '/d'] },
    } as const;
    const malformed: unknown[] = [
      { ...good, counts: undefined },
      { ...good, counts: 'x' },
      { ...good, elapsedMs: Number.NaN },
      { ...good, elapsedMs: -1 },
      { ...good, counts: { ...good.counts, pages: Number.NaN } },
      { ...good, counts: { ...good.counts, warnings: undefined } },
      { ...good, counts: { ...good.counts, written: -3 } },
      { ...good, counts: { ...good.counts, routes: '/a' } },
      { ...good, counts: { ...good.counts, routes: [1] } },
    ];
    for (const event of malformed) {
      const model = new ProgressModel();
      model.apply(started(1));
      expect(model.apply(event as ProgressEvent)).toBeUndefined();
      expect(model.inFlight).toBe(true);
    }
    const model = new ProgressModel();
    model.apply(started(1));
    const change = model.apply({
      ...good,
      counts: { ...good.counts, written: 2.7 },
    } as unknown as ProgressEvent);
    expect(change).toMatchObject({
      kind: 'settled',
      event: {
        elapsedMs: 400,
        phases: { commit: 100 },
        counts: { written: 2, routes: ['/a', '/b', '/c'] },
      },
    });
    expect(change?.kind === 'settled' && 'pass' in change.event).toBe(false);
    expect(change?.kind === 'settled' && 'reason' in change.event).toBe(false);
    const withPhases = new ProgressModel();
    withPhases.apply(started(1));
    expect(
      withPhases.apply({ ...good, phases: undefined, pass: 'full', reason: ' x ' } as never),
    ).toMatchObject({
      event: { phases: {}, pass: 'full', reason: 'x' },
    });
  });

  it('property: random, reordered and duplicated streams never break ordering, counts or the monotonic fraction', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const next = random(seed);
      const base = [
        ...SCENARIOS['supersession']().events,
        ...generation({
          generation: 9,
          trigger: 'watch',
          phases: [
            { phase: 'semantic', ms: 300, pass: 'targeted' },
            { phase: 'render', ms: 900, total: 40 },
            { phase: 'discovery', ms: 200, pass: 'full', reason: 'x' },
            { phase: 'render', ms: 800, total: 664 },
            { phase: 'commit', ms: 400, total: 12 },
          ],
          status: 'success',
          counts: COLD_COUNTS,
          start: 40_000,
        }),
      ].map((entry) => entry.event);
      // Shuffle locally, duplicate some, drop some.
      const stream: ProgressEvent[] = [];
      for (const event of base) {
        const roll = next();
        if (roll < 0.05) continue;
        stream.push(event);
        if (roll > 0.95) stream.push(event);
      }
      for (let index = stream.length - 1; index > 0; index--) {
        if (next() < 0.1) {
          const other = Math.max(0, index - 1 - Math.floor(next() * 4));
          [stream[index], stream[other]] = [stream[other], stream[index]];
        }
      }
      const model = new ProgressModel();
      interface Seen {
        seq: number;
        fraction: number;
        settled: boolean;
        totals: Record<string, number>;
        completed: Map<string, number>;
      }
      const seen = new Map<number, Seen>();
      for (const event of stream) {
        const change = model.apply(event);
        if (!change || change.kind === 'activity') continue;
        const view = change.view;
        const state: Seen = seen.get(view.generation) ?? {
          seq: -1,
          fraction: 0,
          settled: false,
          totals: {},
          completed: new Map(),
        };
        expect(state.settled).toBe(false); // nothing after settle
        if (change.kind !== 'started') expect(view.lastSeq).toBeGreaterThan(state.seq);
        expect(view.fraction).toBeGreaterThanOrEqual(state.fraction);
        expect(view.fraction).toBeLessThanOrEqual(1);
        if (change.kind === 'progress' && view.phase) {
          const key = `${view.pass ?? ''}:${view.phase}`;
          const total = view.totals[view.phase];
          if (change.phaseStarted && total !== undefined) state.totals[key] = total;
          if (total !== undefined) expect(total).toBe(state.totals[key] ?? total);
          const completed = view.completed ?? 0;
          if (!change.phaseStarted)
            expect(completed).toBeGreaterThanOrEqual(state.completed.get(key) ?? 0);
          if (total !== undefined) expect(completed).toBeLessThanOrEqual(total);
          state.completed.set(key, completed);
        }
        state.seq = view.lastSeq;
        state.fraction = view.fraction;
        state.settled = change.kind === 'settled';
        seen.set(view.generation, state);
      }
    }
  });
});
