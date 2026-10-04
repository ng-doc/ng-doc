import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';

import { LINES_MIN_HEARTBEAT_MS, LinesRenderer } from '../lines';
import {
  type ExitProcess,
  CLEAR_LINE,
  createProcessExitHook,
  LIVE_IDLE_TICK_MS,
  LIVE_MIN_INTERVAL_MS,
  LiveRenderer,
  processExitHook,
} from '../live';
import type { GenerationView } from '../model';
import { createProgressReporter } from '../reporter';
import { CaptureWriter, FakeClock } from './harness/fake-io';
import { legacyCadence, replay, SCENARIOS } from './harness/simulate';

const view = (overrides: Partial<GenerationView> = {}): GenerationView => ({
  generation: 1,
  trigger: 'build',
  mode: 'production',
  changes: 0,
  elapsedMs: 0,
  lastSeq: 0,
  restarted: false,
  totals: {},
  stepped: true,
  fraction: 0,
  ...overrides,
});

describe('LiveRenderer', () => {
  it('first draw after the delay, one change-driven redraw per 750 ms, 1 Hz idle tick, no newline', () => {
    const writes: string[] = [];
    const live = new LiveRenderer({
      stream: { write: (chunk) => writes.push(chunk) },
      unicode: false,
      columns: () => 40,
      bar: false,
      exitHook: () => () => {},
    });
    expect(live.nextWake()).toBeUndefined();
    live.wake(0);
    live.touch();
    let body = 'a';
    live.track((now) => ({ body, elapsedMs: now }), 0);
    expect(live.tracking).toBe(true);
    live.wake(100);
    expect(writes).toEqual([]);
    expect(live.nextWake()).toBe(500);
    live.wake(500);
    expect(writes).toEqual([`${CLEAR_LINE}- NgDoc a, 0s`]);
    expect(live.nextWake()).toBe(500 + LIVE_IDLE_TICK_MS);
    body = 'b';
    live.touch();
    expect(live.nextWake()).toBe(500 + LIVE_MIN_INTERVAL_MS);
    live.wake(1_249);
    expect(writes).toHaveLength(1);
    live.wake(1_250);
    expect(writes.at(-1)).toBe(`${CLEAR_LINE}- NgDoc b, 1s`); // the spinner turns on idle ticks only
    expect(writes.every((chunk) => !chunk.includes('\n'))).toBe(true);
    expect(live.showing).toBe(true);
    live.stop();
    expect(writes.at(-1)).toBe(CLEAR_LINE);
    expect(live.showing).toBe(false);
    live.clear();
    expect(writes.at(-1)).toBe(CLEAR_LINE);
    expect(live.frames).toBe(2);
  });

  it('skips a redraw when the text did not change', () => {
    const writes: string[] = [];
    const live = new LiveRenderer({
      stream: { write: (chunk) => writes.push(chunk) },
      unicode: false,
      columns: () => 40,
      bar: false,
      exitHook: () => () => {},
    });
    live.track(() => ({ body: 'same', elapsedMs: 0 }), 0, 0);
    live.wake(0);
    live.touch();
    live.wake(750); // change-driven, nothing visible changed: nothing written
    expect(writes.length).toBe(1);
    live.wake(1_750); // idle tick turns the spinner
    expect(writes.length).toBe(2);
  });

  it('registers the exit hook while a line is showing', () => {
    const add = vi.spyOn(process, 'once');
    const remove = vi.spyOn(process, 'removeListener');
    try {
      const unhook = processExitHook(() => {});
      expect(add).toHaveBeenCalledWith('exit', expect.any(Function));
      unhook();
      expect(remove).toHaveBeenCalledWith('exit', expect.any(Function));
    } finally {
      add.mockRestore();
      remove.mockRestore();
    }
  });

  describe('process exit hook', () => {
    const SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const;
    const fakeProcess = (overrides: { platform?: string; raw?: boolean } = {}) => {
      const emitter = new EventEmitter();
      const kill = vi.fn();
      const exit = vi.fn();
      const setRawMode = vi.fn();
      const stdin = { isTTY: true, isRaw: overrides.raw ?? false, setRawMode };
      const target = Object.assign(emitter, {
        pid: 42,
        kill,
        exit,
        platform: overrides.platform ?? 'linux',
        stdin,
      }) as unknown as ExitProcess & EventEmitter;
      return { emitter, kill, exit, setRawMode, target };
    };

    it('runs the callback at exit and removes every listener on removal', () => {
      const { emitter, target } = fakeProcess();
      const callback = vi.fn();
      const remove = createProcessExitHook(target)(callback);
      for (const signal of SIGNALS) expect(emitter.listenerCount(signal)).toBe(1);
      emitter.emit('exit');
      expect(callback).toHaveBeenCalledTimes(1);
      remove();
      for (const event of ['exit', ...SIGNALS]) expect(emitter.listenerCount(event)).toBe(0);
    });

    it('alone on a signal: clears, removes itself and raises the signal again', () => {
      const { emitter, kill, target } = fakeProcess();
      const callback = vi.fn();
      createProcessExitHook(target)(callback);
      emitter.emit('SIGINT', 'SIGINT');
      expect(callback).toHaveBeenCalledTimes(1);
      expect(kill).toHaveBeenCalledWith(42, 'SIGINT');
      for (const event of ['exit', ...SIGNALS]) expect(emitter.listenerCount(event)).toBe(0);
    });

    it('next to a host handler: clears and leaves the signal to the host', () => {
      const { emitter, kill, target } = fakeProcess();
      const host = vi.fn();
      emitter.on('SIGTERM', host);
      const callback = vi.fn();
      createProcessExitHook(target)(callback);
      emitter.emit('SIGTERM', 'SIGTERM');
      expect(callback).toHaveBeenCalledTimes(1);
      expect(host).toHaveBeenCalledTimes(1);
      // The line is cleared before the host prints anything.
      expect(callback.mock.invocationCallOrder[0]).toBeLessThan(host.mock.invocationCallOrder[0]);
      expect(kill).not.toHaveBeenCalled();
      expect(emitter.listenerCount('SIGTERM')).toBe(1);
    });

    it('restores a raw terminal before raising the signal again', () => {
      const { emitter, kill, setRawMode, target } = fakeProcess({ raw: true });
      createProcessExitHook(target)(vi.fn());
      emitter.emit('SIGTERM', 'SIGTERM');
      expect(setRawMode).toHaveBeenCalledWith(false);
      expect(setRawMode.mock.invocationCallOrder[0]).toBeLessThan(kill.mock.invocationCallOrder[0]);
      expect(kill).toHaveBeenCalledWith(42, 'SIGTERM');
    });

    it('a terminal that cannot be restored still lets the process end', () => {
      const { emitter, kill, setRawMode, target } = fakeProcess({ raw: true });
      setRawMode.mockImplementation(() => {
        throw new Error('EIO');
      });
      createProcessExitHook(target)(vi.fn());
      emitter.emit('SIGINT', 'SIGINT');
      expect(kill).toHaveBeenCalledWith(42, 'SIGINT');
    });

    it('Windows: exits with 128 + the signal number instead of raising it', () => {
      const { emitter, kill, exit, target } = fakeProcess({ platform: 'win32' });
      createProcessExitHook(target)(vi.fn());
      emitter.emit('SIGHUP', 'SIGHUP');
      expect(kill).not.toHaveBeenCalled();
      expect(exit).toHaveBeenCalledWith(129);
    });

    it('a signal that cannot be raised exits with 128 + its number', () => {
      const { emitter, kill, exit, target } = fakeProcess();
      kill.mockImplementation(() => {
        throw Object.assign(new Error('kill ENOSYS'), { code: 'ENOSYS' });
      });
      createProcessExitHook(target)(vi.fn());
      emitter.emit('SIGTERM', 'SIGTERM');
      expect(exit).toHaveBeenCalledWith(143);
    });
  });

  it('once the process is ending, a host that lives on never gets the line back', () => {
    let hook: (() => void) | undefined;
    const writes: string[] = [];
    const live = new LiveRenderer({
      stream: { write: (chunk: string) => writes.push(chunk) },
      unicode: false,
      columns: () => 80,
      bar: false,
      exitHook: (callback) => {
        hook = callback;
        return () => {};
      },
    });
    live.track(() => ({ body: 'rendering', elapsedMs: 0 }), 0, 0);
    live.wake(0);
    expect(live.showing).toBe(true);
    hook?.();
    expect(live.showing).toBe(false);
    expect(live.tracking).toBe(false);
    const written = writes.length;
    // The host handled the signal and prints its shutdown; a new generation must not redraw.
    live.track(() => ({ body: 'rendering again', elapsedMs: 0 }), 10, 0);
    live.touch();
    live.wake(10_000);
    expect(live.tracking).toBe(false);
    expect(writes.slice(written)).toEqual([]);
  });

  it('the exit hook never throws, even when the stream is already closed', () => {
    let atExit: (() => void) | undefined;
    let closed = false;
    const live = new LiveRenderer({
      stream: {
        write: () => {
          if (closed) throw new Error('EIO');
          return true;
        },
      },
      unicode: false,
      columns: () => 40,
      bar: false,
      exitHook: (callback) => {
        atExit = callback;
        return () => {};
      },
    });
    live.track(() => ({ body: 'x', elapsedMs: 0 }), 0, 0);
    live.wake(0);
    closed = true;
    expect(() => atExit?.()).not.toThrow();
    expect(atExit).toBeDefined();
  });
});

describe('LinesRenderer', () => {
  it('start line, one line per step, heartbeat never faster than 5 s', () => {
    const printed: string[] = [];
    const lines = new LinesRenderer({
      print: (text) => printed.push(text),
      heartbeatMs: 1_000,
      compact: false,
      project: 'docs',
    });
    expect(lines.nextWake()).toBeUndefined();
    lines.update(0);
    lines.wake(0);
    const current = view({ phase: 'boot' });
    let elapsed = 0;
    lines.track(current, () => elapsed, 0);
    expect(printed).toEqual(['NgDoc: generating documentation for docs (production)']);
    lines.update(0);
    expect(printed.at(-1)).toBe('NgDoc: [1/4] preparing (starting) (0%)');
    current.phase = 'semantic';
    lines.update(10);
    expect(printed).toHaveLength(2);
    expect(lines.nextWake()).toBe(LINES_MIN_HEARTBEAT_MS);
    elapsed = 5_000;
    lines.wake(4_999);
    expect(printed).toHaveLength(2);
    lines.wake(5_000);
    expect(printed.at(-1)).toBe('NgDoc: [1/4] preparing (analyzing TypeScript) (0%), 5.0s elapsed');
    lines.stop();
    expect(lines.tracking).toBe(false);
  });

  it('prints CI assist lines after progress lines only', () => {
    const printed: string[] = [];
    const lines = new LinesRenderer({
      print: (text) => printed.push(text),
      heartbeatMs: 15_000,
      compact: true,
      assist: 'azure',
    });
    const current = view({ phase: 'render', totals: { render: 10 }, completed: 5, fraction: 0.5 });
    lines.track(current, () => 1_000, 0);
    lines.update(0);
    // The step line shows the total; the heartbeat shows the count so far.
    lines.wake(15_000);
    expect(printed).toEqual([
      'NgDoc: started (production)',
      'NgDoc: rendering 10 pages, 50%, 1.0s',
      '##vso[task.setprogress value=50;]NgDoc: rendering 10 pages (50%)',
      'NgDoc: rendering 5/10 pages, 50%, 1.0s',
      '##vso[task.setprogress value=50;]NgDoc: rendering 5/10 pages (50%)',
    ]);
    const unstepped = new LinesRenderer({
      print: (text) => printed.push(text),
      heartbeatMs: 15_000,
      compact: false,
      assist: 'azure',
    });
    unstepped.track(view({ stepped: false, phase: 'commit' }), () => 0, 0);
    unstepped.update(0);
    expect(printed.at(-1)).toBe('NgDoc: writing files');
  });
});

describe('volume', () => {
  it('the legacy cadence (12,128 updates in 60 s) gives a bounded LINES log', () => {
    for (const env of [
      { CI: 'true' },
      {},
      { NX_TASK_TARGET_PROJECT: 'p', NX_STREAM_OUTPUT: 'true' },
    ]) {
      const clock = new FakeClock();
      const writer = new CaptureWriter({ clock });
      replay(
        legacyCadence(),
        createProgressReporter({ writer, setting: 'auto', env, clock }),
        clock,
      );
      const log = writer.terminal();
      expect(writer.lines().length).toBeLessThanOrEqual(25);
      expect(Buffer.byteLength(log)).toBeLessThanOrEqual(4_096);
      expect(log).not.toContain('\x1b');
    }
  });

  it('LIVE draws at most 5 frames per second of simulated time', () => {
    const clock = new FakeClock();
    const writer = new CaptureWriter({ clock, tty: { columns: 120 } });
    replay(
      legacyCadence(),
      createProgressReporter({ writer, setting: 'auto', env: {}, clock, exitHook: () => () => {} }),
      clock,
    );
    const frames = writer.written.filter(
      (entry) => entry.channel === 'live' && entry.text !== CLEAR_LINE,
    );
    expect(frames.length).toBeLessThanOrEqual(5 * 60);
    const perSecond = new Map<number, number>();
    for (const frame of frames)
      perSecond.set(
        Math.floor(frame.at / 1000),
        (perSecond.get(Math.floor(frame.at / 1000)) ?? 0) + 1,
      );
    expect(Math.max(...perSecond.values())).toBeLessThanOrEqual(5);
    // Worst case, an update every 5 ms: still at most 2 redraws per second, under 16 KB.
    expect(Math.max(...perSecond.values())).toBeLessThanOrEqual(2);
    expect(Buffer.byteLength(writer.terminal())).toBeLessThan(12_288);
  });

  it('LIVE output of a 60 s cold build stays under 16 KB (an Nx cache replays it into CI logs)', () => {
    const clock = new FakeClock();
    const writer = new CaptureWriter({ clock, tty: { columns: 120 } });
    const scenario = SCENARIOS['cold-build-60s']();
    expect(scenario.end).toBeGreaterThanOrEqual(60_000);
    replay(
      scenario,
      createProgressReporter({ writer, setting: 'auto', env: {}, clock, exitHook: () => () => {} }),
      clock,
    );
    const frames = writer.written.filter(
      (entry) => entry.channel === 'live' && entry.text !== CLEAR_LINE,
    );
    const perSecond = new Map<number, number>();
    for (const frame of frames) {
      const second = Math.floor(frame.at / 1000);
      perSecond.set(second, (perSecond.get(second) ?? 0) + 1);
    }
    expect(Math.max(...perSecond.values())).toBeLessThanOrEqual(5);
    // Only changed text is written.
    expect(new Set(frames.map((frame) => frame.text)).size).toBe(frames.length);
    expect(Buffer.byteLength(writer.terminal())).toBeLessThan(12_288);
  });
});
