import { ciProgressMessage } from './ci';
import type { CiVendor } from './detect';
import { compactText, startLine, stepLine, stepText } from './format';
import type { GenerationView } from './model';
import { stepOf } from './model';

/** Never more than one heartbeat line per 5 s, whatever the configured cadence. */
export const LINES_MIN_HEARTBEAT_MS = 5_000;

export interface LinesOptions {
  /** Prints one line (never throws into the renderer's caller; the reporter contains it). */
  print: (text: string) => void;
  /** Prints a CI service message verbatim (free text goes through `print`, which neutralizes them). */
  service?: (text: string) => void;
  heartbeatMs: number;
  /** Nx TUI / stream output: short append-only lines. */
  compact: boolean;
  /** Azure/TeamCity hidden progress messages, printed after each progress line. */
  assist?: CiVendor;
  project?: string;
}

/**
 * LINES renderer for one build generation: a start line, one line per step, and a heartbeat on a
 * fixed cadence. ASCII only, no escape bytes. About 5–10 lines for a 20–40 s build.
 */
export class LinesRenderer {
  private view: GenerationView | undefined;
  private elapsed: ((now: number) => number) | undefined;
  private printedSteps = new Set<string>();
  private lastLineAt = 0;
  /** Lines written for the tracked generation, for volume checks. */
  lines = 0;

  constructor(private readonly options: LinesOptions) {}

  get tracking(): boolean {
    return this.view !== undefined;
  }

  /** Starts a generation: prints the start line. */
  track(view: GenerationView, elapsed: (now: number) => number, now: number): void {
    this.view = view;
    this.elapsed = elapsed;
    this.printedSteps = new Set(['generating']);
    this.lines = 0;
    this.emit(startLine(view, this.options.project, this.options.compact), now, false);
  }

  /** A progress event was accepted: prints a line when a new step started. */
  update(now: number): void {
    const view = this.view;
    if (!view?.phase) return;
    const key = view.stepped
      ? `step-${stepOf(view.phase)}`
      : view.phase === 'commit' // the commit start carries the file count
        ? 'writing'
        : 'generating';
    if (this.printedSteps.has(key)) return;
    this.printedSteps.add(key);
    this.progressLine(now, true);
  }

  nextWake(): number | undefined {
    if (!this.view) return undefined;
    return this.lastLineAt + Math.max(LINES_MIN_HEARTBEAT_MS, this.options.heartbeatMs);
  }

  /** Heartbeat. */
  wake(now: number): void {
    const due = this.nextWake();
    if (due === undefined || now < due) return;
    this.progressLine(now);
  }

  stop(): void {
    this.view = undefined;
    this.elapsed = undefined;
  }

  /** `step`: the line that announces a step shows totals; a heartbeat shows the count so far. */
  private progressLine(now: number, step: boolean = false): void {
    const view = this.view!;
    const elapsed = this.elapsed!(now);
    this.emit(
      this.options.compact ? compactText(view, elapsed, step) : stepLine(view, elapsed, step),
      now,
      true,
      step,
    );
  }

  private emit(text: string, now: number, progress: boolean, totals: boolean = false): void {
    this.lastLineAt = now;
    this.lines++;
    this.options.print(text);
    const view = this.view!;
    if (!progress || !this.options.assist) return;
    const assist = ciProgressMessage(
      this.options.assist,
      `NgDoc: ${stepText(view, { totals }).replace(/^\[\d\/\d\] /, '')}`,
      view.stepped ? view.fraction * 100 : undefined,
    );
    if (assist) (this.options.service ?? this.options.print)(assist);
  }
}
