import type { Generation } from '../contracts';
import type { ProgressEvent } from './events';
import type { ProgressClock } from './reporter';
import { systemClock } from './reporter';

/**
 * How long a settled generation waits for its host at most. Hosts release every generation whose
 * result they handled; this bound only keeps a host that missed one from silencing progress.
 */
export const SETTLE_HOLD_MS = 10_000;

export interface SettleGateOptions {
  clock?: ProgressClock;
  holdMs?: number;
}

/**
 * Keeps a generation's result line behind the host's own output for that generation.
 *
 * The session reports `progress-settled` before it hands the result to the host, and the host
 * prints the result's diagnostics after that. The gate holds each `progress-settled` event, and
 * every event after it in order, until the host calls `release(generation)` once it has printed
 * what it prints for that result. So `FAILED … (2 errors, see above)` follows the errors, and an
 * edit line follows the host's own log. Order is never changed. A generation that the host
 * released before its settle arrived passes through at once, and after `holdMs` held events are
 * forwarded anyway. A host that could not publish a committed result releases it as failed, and
 * its line becomes the failure line.
 */
export class SettleGate {
  private readonly queue: ProgressEvent[] = [];
  /** Released generations, and whether the host failed to publish each. */
  private readonly released = new Map<Generation, boolean>();
  private readonly clock: ProgressClock;
  private readonly holdMs: number;
  private timer: unknown;
  private disposed = false;

  constructor(
    private readonly target: (event: ProgressEvent) => void,
    options: SettleGateOptions = {},
  ) {
    this.clock = options.clock ?? systemClock;
    this.holdMs = options.holdMs ?? SETTLE_HOLD_MS;
  }

  /** The session's `onProgress`. */
  readonly sink = (event: ProgressEvent): void => {
    if (this.disposed) return;
    this.queue.push(event);
    this.flush();
  };

  /**
   * The host has printed its output for `generation`'s result; `failed` when it could not publish
   * a committed result. Releasing a generation that never settles (a reused result, a generation
   * without progress) is harmless.
   */
  release(generation: Generation, failed: boolean = false): void {
    if (this.disposed) return;
    this.released.set(generation, failed || this.released.get(generation) === true);
    this.flush();
  }

  /** Forwards everything still held, then stops. */
  dispose(): void {
    if (this.disposed) return;
    this.cancelTimer();
    const held = this.queue.splice(0);
    this.disposed = true;
    this.released.clear();
    for (const event of held) this.forward(event);
  }

  private flush(): void {
    while (this.queue.length) {
      const head = this.queue[0];
      if (head.kind === 'progress-settled' && !this.released.has(head.generation)) {
        this.timer ??= this.clock.setTimeout(() => this.expire(), this.holdMs);
        return;
      }
      this.cancelTimer();
      this.forward(this.queue.shift()!);
    }
  }

  private expire(): void {
    this.timer = undefined;
    const head = this.queue.shift();
    if (head) this.forward(head);
    this.flush();
  }

  private forward(event: ProgressEvent): void {
    if (event.kind === 'progress-settled') {
      if (
        this.released.get(event.generation) === true &&
        (event.status === 'success' || event.status === 'superseded')
      )
        event = {
          ...event,
          status: 'failure',
          counts: { ...event.counts, errors: Math.max(1, event.counts.errors) },
        };
      // Generations settle one at a time and in order: releases up to this one are spent.
      for (const generation of [...this.released.keys()])
        if (generation <= event.generation) this.released.delete(generation);
    }
    try {
      this.target(event);
    } catch {
      /* Progress is advisory: a failing consumer never reaches the host's release call. */
    }
  }

  private cancelTimer(): void {
    if (this.timer === undefined) return;
    this.clock.clearTimeout(this.timer);
    this.timer = undefined;
  }
}
