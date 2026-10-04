import { describe, expect, it, vi } from 'vitest';

import type { ProgressEvent } from '../events';
import { SETTLE_HOLD_MS, SettleGate } from '../gate';
import { createHostProgress } from '../host';
import { systemClock } from '../reporter';
import { CaptureWriter, FakeClock } from './harness/fake-io';

const started = (generation: number): ProgressEvent => ({
  kind: 'progress-started',
  generation,
  seq: 0,
  trigger: 'build',
  mode: 'production',
  changes: 0,
  elapsedMs: 0,
});

const commit = (generation: number, seq: number): ProgressEvent => ({
  kind: 'progress',
  generation,
  seq,
  phase: 'commit',
  state: 'start',
  elapsedMs: 10,
});

const settled = (
  generation: number,
  seq = 2,
  status: 'success' | 'failure' = 'success',
): ProgressEvent => ({
  kind: 'progress-settled',
  generation,
  seq,
  status,
  elapsedMs: 1_200,
  phases: { commit: 100 },
  counts: { pages: 3, rebuilt: 3, errors: status === 'failure' ? 2 : 0, warnings: 0, written: 9 },
});

const label = (event: ProgressEvent) =>
  'generation' in event ? `${event.kind}:${event.generation}` : event.kind;

function gate(holdMs?: number) {
  const clock = new FakeClock();
  const seen: string[] = [];
  const instance = new SettleGate((event) => void seen.push(label(event)), {
    clock,
    ...(holdMs ? { holdMs } : {}),
  });
  return { clock, seen, gate: instance };
}

describe('SettleGate', () => {
  it('holds a settle, and everything after it, until the host releases that generation', () => {
    const { seen, gate: g } = gate();
    g.sink(started(1));
    g.sink(commit(1, 1));
    g.sink(settled(1));
    g.sink(started(2));
    g.sink({ kind: 'progress-activity', activity: 'warming-up', state: 'start', elapsedMs: 0 });
    g.sink(settled(2, 1));
    expect(seen).toEqual(['progress-started:1', 'progress:1']);
    // Releasing a later generation first changes nothing: order is kept.
    g.release(2);
    expect(seen).toEqual(['progress-started:1', 'progress:1']);
    g.release(1);
    expect(seen).toEqual([
      'progress-started:1',
      'progress:1',
      'progress-settled:1',
      'progress-started:2',
      'progress-activity',
      'progress-settled:2',
    ]);
  });

  it('passes a settle at once when the host released its generation first', () => {
    const { seen, gate: g } = gate();
    g.release(1);
    g.sink(started(1));
    g.sink(settled(1));
    expect(seen).toEqual(['progress-started:1', 'progress-settled:1']);
    // Spent: a later settle of the next generation waits again.
    g.sink(settled(2, 1));
    expect(seen).toHaveLength(2);
  });

  it('forwards a held settle after the hold time, and restarts the wait for the next one', () => {
    const { clock, seen, gate: g } = gate(1_000);
    g.sink(settled(1));
    g.sink(settled(2, 1));
    clock.advance(999);
    expect(seen).toEqual([]);
    clock.advance(1);
    expect(seen).toEqual(['progress-settled:1']);
    clock.advance(1_000);
    expect(seen).toEqual(['progress-settled:1', 'progress-settled:2']);
    expect(clock.pending).toBe(0);
  });

  it('flushes on dispose and ignores everything afterwards', () => {
    const { clock, seen, gate: g } = gate();
    g.sink(settled(1));
    g.sink(started(2));
    g.dispose();
    g.dispose();
    expect(seen).toEqual(['progress-settled:1', 'progress-started:2']);
    expect(clock.pending).toBe(0);
    g.sink(started(3));
    g.release(3);
    expect(seen).toHaveLength(2);
  });

  it('turns a result the host failed to publish into a failure, before or after it settles', () => {
    const seen: ProgressEvent[] = [];
    const g = new SettleGate((event) => void seen.push(event), { clock: new FakeClock() });
    g.sink(settled(1));
    g.release(1, true);
    g.release(2, true);
    g.sink({ ...settled(2), status: 'superseded' } as ProgressEvent);
    g.sink(settled(3, 2, 'failure'));
    g.release(3, true);
    g.sink(settled(4));
    g.release(4);
    expect(
      seen.map((event) =>
        event.kind === 'progress-settled' ? [event.status, event.counts.errors] : [],
      ),
    ).toEqual([
      ['failure', 1],
      ['failure', 1],
      ['failure', 2],
      ['success', 0],
    ]);
  });

  it('contains a failing consumer', () => {
    const g = new SettleGate(() => {
      throw new Error('broken');
    });
    expect(() => g.sink(started(1))).not.toThrow();
    g.sink(settled(1));
    expect(() => g.release(1)).not.toThrow();
    g.dispose();
  });

  it('defaults to the system clock and a ten-second hold', () => {
    const setTimeout = vi.spyOn(systemClock, 'setTimeout');
    try {
      const g = new SettleGate(() => {});
      g.sink(settled(1));
      expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), SETTLE_HOLD_MS);
      g.dispose();
    } finally {
      setTimeout.mockRestore();
    }
  });
});

describe('createHostProgress', () => {
  it('prints a result line only after the host released it, and forwards every event', () => {
    const clock = new FakeClock();
    const writer = new CaptureWriter({ clock, summary: true });
    const forwarded: string[] = [];
    const progress = createHostProgress({
      writer,
      setting: 'plain',
      env: {},
      clock,
      exitHook: () => () => {},
      forward: (event) => void forwarded.push(label(event)),
    });
    progress.sink(started(1));
    progress.sink(settled(1, 1, 'failure'));
    const before = writer.written.map((entry) => entry.text);
    expect(before.some((text) => text.includes('FAILED'))).toBe(false);
    progress.release(1);
    expect(writer.written.at(-1)?.text).toContain('FAILED generation failed after 1.2s (2 errors');
    expect(forwarded).toEqual(['progress-started:1', 'progress-settled:1']);
    progress.setForeign('summaries');
    expect(progress.reporter.environment.foreign).toBe(true);
    progress.dispose();
  });

  it('reports a broken writer once through the host warning channel', () => {
    const warnings: string[] = [];
    const errors: unknown[] = [];
    const broken = createHostProgress({
      writer: {
        line: () => {
          throw new Error('stream closed');
        },
      },
      setting: 'plain',
      env: {},
      warn: (message) => void warnings.push(message),
      onError: (error) => void errors.push(error),
    });
    broken.sink(started(1));
    broken.sink(started(2));
    expect(warnings).toEqual([
      '[SESSION_PROGRESS_FAILED] Progress reporting failed and was skipped: stream closed',
    ]);
    expect(errors).toHaveLength(1);
    const silent = createHostProgress({
      writer: {
        line: () => {
          throw new Error('stream closed');
        },
      },
      setting: 'plain',
      env: {},
      warn: () => {
        throw new Error('logger closed too');
      },
    });
    expect(() => silent.sink(started(1))).not.toThrow();
    broken.dispose();
    silent.dispose();
  });

  it('contains a failing or rejecting forward consumer', async () => {
    const writer = new CaptureWriter({});
    const rejecting = createHostProgress({
      writer,
      setting: 'summary',
      env: {},
      forward: () => Promise.reject(new Error('rejected')),
    });
    expect(() => rejecting.sink(started(1))).not.toThrow();
    const throwing = createHostProgress({
      writer,
      setting: 'summary',
      env: {},
      forward: () => {
        throw new Error('thrown');
      },
    });
    expect(() => throwing.sink(started(1))).not.toThrow();
    await Promise.resolve();
    rejecting.dispose();
    throwing.dispose();
  });

  it('clears the live line when the host prints, and redraws it on the next frame', () => {
    const clock = new FakeClock();
    const writer = new CaptureWriter({ clock, tty: { columns: 80 } });
    const progress = createHostProgress({
      writer,
      setting: 'live',
      env: {},
      platform: 'linux',
      clock,
      exitHook: () => () => {},
    });
    progress.sink(started(1));
    clock.advance(600);
    expect(writer.frames()).toHaveLength(1);
    const before = writer.written.length;
    progress.interrupt();
    expect(writer.written.slice(before).map((entry) => entry.text)).toEqual(['\r\x1b[2K']);
    clock.advance(1_000);
    expect(writer.frames()).toHaveLength(2);
    progress.dispose();
    const after = writer.written.length;
    progress.interrupt();
    expect(writer.written).toHaveLength(after);
  });

  it('prints held results on dispose', () => {
    const writer = new CaptureWriter({ summary: true });
    const progress = createHostProgress({ writer, setting: 'summary', env: {} });
    progress.sink(started(1));
    progress.sink(settled(1));
    expect(writer.written).toEqual([]);
    progress.dispose();
    expect(writer.written.map((entry) => entry.text)).toEqual([
      'NgDoc: OK generated 3 pages in 1.2s; 9 files written; write 0.1s',
    ]);
  });
});
