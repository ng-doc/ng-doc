import { constants } from 'node:os';

import type { LiveTextOptions } from './format';
import { liveText } from './format';

/** The stream the live line is drawn on (normally `process.stderr`). */
export interface LiveStream {
  write(chunk: string): unknown;
  columns?: number;
}

/**
 * Registers a callback for the end of the process and returns its removal
 * ({@link processExitHook} by default).
 */
export type ExitHook = (callback: () => void) => () => void;

/** The process-control port of {@link createProcessExitHook}. */
export interface ExitProcess {
  once(event: 'exit', listener: () => void): unknown;
  prependListener(event: NodeJS.Signals, listener: (signal: NodeJS.Signals) => void): unknown;
  removeListener(event: 'exit' | NodeJS.Signals, listener: (...args: never[]) => void): unknown;
  listenerCount(event: NodeJS.Signals): number;
  kill(pid: number, signal: NodeJS.Signals): unknown;
  exit(code: number): unknown;
  readonly pid: number;
  readonly platform: string;
  readonly stdin?: { isTTY?: boolean; isRaw?: boolean; setRawMode?(mode: boolean): unknown };
}

/**
 * The signals that end a process whose terminal the live line is on. Ctrl-C before a host
 * installs its own handler (Vite, or the Angular CLI before its dev server starts) ends Node without
 * `exit` listeners, which would leave the live line on the screen.
 */
const EXIT_SIGNALS: readonly NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGHUP'];

/**
 * Calls `callback` once, at `exit` or on SIGINT, SIGTERM or SIGHUP, and removes every listener it
 * added.
 *
 * Host signal behaviour is kept in both cases:
 * - **The host handles the signal** (a listener of its own, added before or after this one): the
 *   callback runs first, so the line is gone before the host prints its shutdown lines, and the
 *   host decides what happens next. Node's disposition does not change, since the host's listener
 *   already replaced the default.
 * - **Nobody else does**: this listener is what replaced Node's default ending, so it gives it
 *   back. It restores the terminal mode (stdin raw mode), removes itself and raises the signal
 *   again, and the process ends by that signal. Limitation: the rest of Node's own stdio reset on a
 *   fatal signal (terminal attributes changed by native code) is not reproduced. Where a signal
 *   cannot be raised (Windows, where only SIGINT and SIGTERM can be sent, or a failing `kill`), it
 *   exits with `128 + signal number`, the shells' code for that signal.
 *
 * Not listening while alone would keep the default ending but leave the line on the screen after
 * Ctrl-C; not listening next to a host's listener would put the host's shutdown lines behind the
 * line. Neither changes behaviour more than this, so the line is always cleared.
 */
export function createProcessExitHook(target: ExitProcess): ExitHook {
  return (callback) => {
    const onSignal = (signal: NodeJS.Signals) => {
      remove();
      callback();
      if (target.listenerCount(signal) > 0) return;
      try {
        if (target.stdin?.isTTY && target.stdin.isRaw) target.stdin.setRawMode?.(false);
      } catch {
        /* The terminal may already be gone. */
      }
      const code = 128 + (constants.signals[signal] ?? 0);
      if (target.platform === 'win32') {
        target.exit(code);
        return;
      }
      try {
        target.kill(target.pid, signal);
      } catch {
        target.exit(code);
      }
    };
    const remove = () => {
      target.removeListener('exit', callback);
      for (const signal of EXIT_SIGNALS) target.removeListener(signal, onSignal);
    };
    target.once('exit', callback);
    for (const signal of EXIT_SIGNALS) target.prependListener(signal, onSignal);
    return remove;
  };
}

export const processExitHook: ExitHook = (callback) =>
  createProcessExitHook(process as unknown as ExitProcess)(callback);

/** Live cadence: bounded redraws keep screen readers and Nx cache replays quiet. */
export const LIVE_FIRST_DRAW_MS = 500;
export const LIVE_ACTIVITY_DRAW_MS = 1_000;
/**
 * Edits draw the in-progress line only past 1 s, so a sub-second edit never flashes one. The
 * edit's completion line is printed regardless.
 */
export const LIVE_EDIT_DRAW_MS = 1_000;
/**
 * Change-driven redraws: at most one per 750 ms (the ceiling is 5 per second). With whole-second
 * elapsed time and a short bar, an Nx cache replay of a 60 s build stays around 10 KB, even when
 * every update changes the text.
 */
export const LIVE_MIN_INTERVAL_MS = 750;
export const LIVE_IDLE_TICK_MS = 1_000;

export const CLEAR_LINE = '\r\x1b[2K';

/** What the live line shows right now. */
export interface LiveFrame {
  body: string;
  elapsedMs: number;
  /** Drives the bar; absent before the steps are known. */
  fraction?: number;
}

export interface LiveOptions {
  stream: LiveStream;
  unicode: boolean;
  /** Read at every draw: the terminal may be resized while a build runs. */
  columns: () => number;
  bar: boolean;
  exitHook?: ExitHook;
}

/** Below this width a live line says too little to be worth redrawing: draw nothing. */
export const LIVE_MIN_COLUMNS = 20;

/**
 * LIVE renderer: one line on the stream, redrawn in place. It is drawn first after a delay (quick
 * work never flashes), then at most every 500 ms when the text changed and on a 1 s idle tick.
 * It never writes `\n` and is cleared at the end, on dispose and at process exit.
 */
export class LiveRenderer {
  private source: ((now: number) => LiveFrame) | undefined;
  private firstDrawAt = 0;
  private lastDrawAt: number | undefined;
  private dirty = false;
  private shown: string | undefined;
  private frame = 0;
  private removeExitHook: (() => void) | undefined;
  /** The process is ending (exit or a signal): nothing is drawn again, even if a host lives on. */
  private ended = false;
  /** Frames written, for volume checks. */
  frames = 0;

  constructor(private readonly options: LiveOptions) {}

  get tracking(): boolean {
    return this.source !== undefined;
  }

  get showing(): boolean {
    return this.shown !== undefined;
  }

  /** Starts showing `source`; the first frame is drawn `delayMs` after `now`. */
  track(
    source: (now: number) => LiveFrame,
    now: number,
    delayMs: number = LIVE_FIRST_DRAW_MS,
  ): void {
    this.clear();
    if (this.ended) return;
    this.source = source;
    this.firstDrawAt = now + delayMs;
    this.lastDrawAt = undefined;
    this.dirty = true;
  }

  /** Something visible changed. */
  touch(): void {
    if (this.source) this.dirty = true;
  }

  /** The absolute time of the next draw, or `undefined` when nothing is tracked. */
  nextWake(): number | undefined {
    if (!this.source) return undefined;
    if (this.lastDrawAt === undefined) return this.firstDrawAt;
    return this.lastDrawAt + (this.dirty ? LIVE_MIN_INTERVAL_MS : LIVE_IDLE_TICK_MS);
  }

  /** Draws when a frame is due at `now`. */
  wake(now: number): void {
    const due = this.nextWake();
    if (due === undefined || now < due || !this.source) return;
    const frame = this.source(now);
    // The spinner turns on the idle tick (1 Hz); a change-driven redraw keeps it, so an update
    // that changes nothing visible writes nothing.
    if (!this.dirty && this.lastDrawAt !== undefined) this.frame++;
    const columns = this.options.columns();
    this.lastDrawAt = now;
    this.dirty = false;
    if (columns < LIVE_MIN_COLUMNS) {
      this.clear();
      this.dirty = false;
      return;
    }
    const options: LiveTextOptions = {
      frame: this.frame,
      unicode: this.options.unicode,
      columns,
      bar: this.options.bar,
    };
    const text = liveText(frame.body, frame.elapsedMs, frame.fraction, options);
    if (text === this.shown) return;
    // Hooked before the first frame is written: a signal that arrives once the line can be on the
    // screen always finds the listener (its handler runs after this synchronous draw).
    this.removeExitHook ??= (this.options.exitHook ?? processExitHook)(() => {
      this.ended = true;
      try {
        this.stop();
      } catch {
        /* At exit the stream may already be closed (EPIPE, EIO); there is nothing left to clean. */
      }
    });
    this.options.stream.write(`${CLEAR_LINE}${text}`);
    this.frames++;
    this.shown = text;
  }

  /** Removes the line (before another line is printed); the next wake redraws it. */
  clear(): void {
    if (this.shown !== undefined) {
      this.shown = undefined;
      this.options.stream.write(CLEAR_LINE);
      if (this.source) this.dirty = true;
    }
    const remove = this.removeExitHook;
    this.removeExitHook = undefined;
    remove?.();
  }

  /** Stops tracking and clears the line. */
  stop(): void {
    this.source = undefined;
    this.clear();
  }
}
