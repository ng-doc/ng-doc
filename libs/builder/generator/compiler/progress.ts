import type { CompilationContext, CompilationPhase, CompilationProgressUpdate } from '../contracts';

/** A reason longer than this is cut: it is shown in one terminal line. */
const REASON_LENGTH = 120;

/**
 * The compiler's side of progress reporting (`CompilationContext.progress`). Advisory only:
 * nothing here reads or changes what a generation compiles, and a sink that throws is ignored.
 *
 * It exists only when the context carries a sink, so a compile without a consumer does no
 * progress work at all (every call site is an optional call). It reads no clock: throttling is
 * the transport's job (a worker runtime coalesces advances before they cross the process
 * boundary), and the session stamps every event with its own clock.
 *
 * Phases are reported in execution order. Starting a phase ends the open one, so each call site
 * marks only where its phase begins. Per-unit loops report through `unit`, which counts the units
 * the open phase finished.
 */
export class CompilationProgress {
  private open?: CompilationPhase;
  private completed = 0;
  private reused = 0;
  private total?: number;
  private pass?: 'targeted' | 'full' | 'restored';
  /** A reason waiting for the first update of the `full` pass. */
  private reason?: string;

  private constructor(private readonly sink: (update: CompilationProgressUpdate) => void) {}

  /** The reporter for a compile, or `undefined` when nobody listens. */
  static of(context: CompilationContext | undefined): CompilationProgress | undefined {
    const sink = context?.progress;
    return typeof sink === 'function' ? new CompilationProgress(sink) : undefined;
  }

  /**
   * The generation's first pass: `targeted` when it may compile only what its changes reach;
   * `full` with the reason when the targeted rebuild considered the generation and decided before
   * compiling that it rebuilds every page. A generation the targeted rebuild never considers (it
   * is off, or the generation retains nothing) reports no pass.
   */
  begin(pass: 'targeted' | 'full', reason?: string): void {
    this.pass = pass;
    this.reason = pass === 'full' ? clip(reason) : undefined;
  }

  /**
   * The fast start published the recorded candidate: the open phase (`restore`) ends with the
   * `restored` pass, which the host's result line reports, and nothing else runs.
   */
  restored(): void {
    this.pass = 'restored';
    this.reason = undefined;
    this.end();
  }

  /** The generation is still on its targeted pass. */
  get targeted(): boolean {
    return this.pass === 'targeted';
  }

  /**
   * The targeted pass fell back to the full one. The next phase start carries `full` and the
   * reason, and the phases may start again from the beginning. Only the first fall back counts.
   */
  full(reason?: string): void {
    if (this.pass !== 'targeted') return;
    this.end();
    this.pass = 'full';
    this.reason = clip(reason);
  }

  /** `phase` starts (ending the open one). `total` is fixed for the phase. */
  phase(phase: CompilationPhase, total?: number): void {
    this.end();
    this.open = phase;
    this.completed = 0;
    this.reused = 0;
    this.total = total;
    this.emit({
      phase,
      state: 'start',
      ...(total !== undefined ? { completed: 0, total } : {}),
      ...this.passFields(),
    });
  }

  /** Units of the open phase finished; `reused` of them were reused rather than computed again. */
  unit(count: number = 1, reused: boolean = false): void {
    const phase = this.open;
    if (!phase || count <= 0) return;
    this.completed += count;
    if (reused) this.reused += count;
    // A phase never reports more than its total, even if a loop visits more units than planned.
    const completed =
      this.total === undefined ? this.completed : Math.min(this.completed, this.total);
    this.emit({
      phase,
      state: 'advance',
      completed,
      ...(phase === 'render' ? { reused: Math.min(this.reused, completed) } : {}),
      ...this.passFields(),
    });
  }

  /** The open phase ends. Nothing when no phase is open. */
  end(): void {
    const phase = this.open;
    if (!phase) return;
    this.open = undefined;
    this.emit({
      phase,
      state: 'end',
      ...(this.total !== undefined ? { completed: this.total, total: this.total } : {}),
      ...(phase === 'render' && this.total !== undefined
        ? { reused: Math.min(this.reused, this.total) }
        : {}),
      ...this.passFields(),
    });
  }

  private passFields(): Pick<CompilationProgressUpdate, 'pass' | 'reason'> {
    if (!this.pass) return {};
    const reason = this.reason;
    this.reason = undefined;
    return { pass: this.pass, ...(reason ? { reason } : {}) };
  }

  private emit(update: CompilationProgressUpdate): void {
    try {
      this.sink(update);
    } catch {
      /* Progress is advisory: a failing consumer never changes a compilation. */
    }
  }
}

function clip(reason: string | undefined): string | undefined {
  if (typeof reason !== 'string') return undefined;
  const text = reason.trim();
  if (!text) return undefined;
  return text.length > REASON_LENGTH ? `${text.slice(0, REASON_LENGTH - 3)}...` : text;
}
