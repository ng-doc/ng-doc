import type { ProgressClock, ProgressWriter } from '../../reporter';

/** A manual clock: timers fire only inside `advanceTo`/`advance`, in time order. */
export class FakeClock implements ProgressClock {
  private current = 0;
  private sequence = 0;
  private timers = new Map<number, { at: number; callback: () => void }>();

  now(): number {
    return this.current;
  }

  setTimeout(callback: () => void, ms: number): unknown {
    const id = ++this.sequence;
    this.timers.set(id, { at: this.current + Math.max(0, ms), callback });
    return id;
  }

  clearTimeout(handle: unknown): void {
    this.timers.delete(handle as number);
  }

  get pending(): number {
    return this.timers.size;
  }

  /** Runs every timer due up to `time`, then sets the clock to `time`. */
  advanceTo(time: number): void {
    for (;;) {
      let next: [number, { at: number; callback: () => void }] | undefined;
      for (const entry of this.timers)
        if (entry[1].at <= time && (!next || entry[1].at < next[1].at)) next = entry;
      if (!next) break;
      this.timers.delete(next[0]);
      this.current = Math.max(this.current, next[1].at);
      next[1].callback();
    }
    this.current = Math.max(this.current, time);
  }

  advance(ms: number): void {
    this.advanceTo(this.current + ms);
  }
}

export type Channel = 'line' | 'summary' | 'timestamped' | 'live';

export interface Written {
  channel: Channel;
  text: string;
  at: number;
}

export interface CaptureOptions {
  clock?: { now(): number };
  /** Gives the writer a live stream with these properties. */
  tty?: { columns?: number; colors?: boolean };
  summary?: boolean;
  /** Formats timestamped lines like Vite's logger (`3:04:27 PM [vite] NgDoc: …`). */
  timestamp?: (at: number) => string;
  /** Throw from `line` on the n-th call (1-based). */
  failOn?: number;
}

/** A writer that records every call, and a fake TTY stream for the live line. */
export class CaptureWriter implements ProgressWriter {
  readonly written: Written[] = [];
  live?: ProgressWriter['live'];
  summary?: (text: string) => void;
  timestampedLine?: (text: string) => void;
  private calls = 0;

  constructor(private readonly options: CaptureOptions = {}) {
    const at = (): number => options.clock?.now() ?? 0;
    if (options.tty)
      this.live = {
        isTTY: true,
        columns: options.tty.columns ?? 120,
        hasColors: () => options.tty?.colors ?? true,
        write: (chunk: string) => {
          this.written.push({ channel: 'live', text: chunk, at: at() });
          return true;
        },
      };
    if (options.summary)
      this.summary = (text) => this.written.push({ channel: 'summary', text, at: at() });
    if (options.timestamp)
      this.timestampedLine = (text) =>
        this.written.push({
          channel: 'timestamped',
          text: `${options.timestamp!(at())}${text}`,
          at: at(),
        });
  }

  line(text: string): void {
    this.calls++;
    if (this.options.failOn === this.calls) throw new Error('writer failed');
    this.written.push({ channel: 'line', text, at: this.options.clock?.now() ?? 0 });
  }

  /** Everything except live chunks, one entry per line. */
  lines(): string[] {
    return this.written.filter((entry) => entry.channel !== 'live').map((entry) => entry.text);
  }

  /** The raw byte stream a terminal would receive (lines end with `\n`, live chunks do not). */
  terminal(): string {
    return this.written
      .map((entry) => (entry.channel === 'live' ? entry.text : `${entry.text}\n`))
      .join('');
  }

  /** The text of every live frame (without the clear sequence). */
  frames(): string[] {
    return this.written
      .filter((entry) => entry.channel === 'live' && entry.text !== '\r\x1b[2K')
      .map((entry) => entry.text.replace('\r\x1b[2K', ''));
  }
}

/** Vite-like timestamp prefix, deterministic: t=0 is 3:04:00 PM. */
export const viteTimestamp = (at: number): string => {
  const seconds = 4 * 60 + Math.floor(at / 1000);
  return `3:${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')} PM [vite] `;
};
