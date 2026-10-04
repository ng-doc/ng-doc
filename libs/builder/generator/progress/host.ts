import type { Generation } from '../contracts';
import type { ProgressEvent, ProgressSink } from './events';
import { progressFailure } from './events';
import { SettleGate } from './gate';
import type { ForeignMode, ProgressReporter, ProgressReporterOptions } from './reporter';
import { createProgressReporter } from './reporter';

export interface HostProgressOptions extends ProgressReporterOptions {
  /** Another consumer the host was given (`SessionOptions.onProgress`); it receives every event. */
  forward?: ProgressSink;
  /**
   * The host's warning channel. When the writer throws, progress stops and this receives one
   * `[SESSION_PROGRESS_FAILED] …` line; its own failures are contained.
   */
  warn?: (message: string) => void;
}

/**
 * A host's progress: the reporter behind a {@link SettleGate}. The host passes `sink` as the
 * session's `onProgress`, calls `release(generation)` once it has printed a result's own output
 * (its diagnostics), and `setForeign` once another writer shares the terminal.
 */
export interface HostProgress {
  readonly reporter: ProgressReporter;
  readonly sink: (event: ProgressEvent) => void;
  /** `failed`: the host could not publish the result; its line becomes the failure line. */
  release(generation: Generation, failed?: boolean): void;
  /** Clears the live line before the host prints its own output (see `ProgressReporter.interrupt`). */
  interrupt(): void;
  setForeign(mode?: ForeignMode): void;
  /** Prints what is still held, then clears the live line and stops. */
  dispose(): void;
}

export function createHostProgress(options: HostProgressOptions): HostProgress {
  const { forward, warn, ...reporterOptions } = options;
  const reporter = createProgressReporter({
    ...reporterOptions,
    onError(error: unknown) {
      try {
        options.onError?.(error);
        const { code, message } = progressFailure(error);
        warn?.(`[${code}] ${message}`);
      } catch {
        /* Progress is advisory. */
      }
    },
  });
  const gate = new SettleGate((event) => reporter.handle(event), {
    ...(options.clock ? { clock: options.clock } : {}),
  });
  const sink = forward
    ? (event: ProgressEvent) => {
        gate.sink(event);
        // The session contains a failing consumer; this one is the host's, so it is contained here.
        try {
          const pending = forward(event);
          if (pending && typeof pending.then === 'function') pending.then(undefined, () => {});
        } catch {
          /* Advisory. */
        }
      }
    : gate.sink;
  return {
    reporter,
    sink,
    release: (generation, failed) => gate.release(generation, failed),
    interrupt: () => reporter.interrupt(),
    setForeign: (mode) => reporter.setForeign(mode),
    dispose() {
      gate.dispose();
      reporter.dispose();
    },
  };
}
