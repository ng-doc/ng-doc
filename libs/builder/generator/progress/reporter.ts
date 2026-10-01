import { appendStepSummary, neutralizeServiceMessages, sectionEnd, sectionStart } from './ci';
import type { ProgressEnvironment, ProgressStream } from './detect';
import { detectProgressEnvironment, NX_TASK_COLUMNS } from './detect';
import type {
  ProgressActivityEvent,
  ProgressEvent,
  ProgressPhase,
  ProgressSettledEvent,
  ProgressTrigger,
} from './events';
import { BACKGROUND_TRIGGERS, plainText } from './events';
import {
  activityDone,
  activityLabel,
  activityNotice,
  backgroundDone,
  backgroundLabel,
  backgroundNotice,
  buildSummary,
  cancelledLine,
  editFailureLine,
  editLine,
  noChangesLine,
  phasesLine,
  PREFIX,
  resolvedBuildLine,
  resolvedLine,
  RESTARTING_LINE,
  restartLine,
  slowEditLine,
  stepText,
  SUPERSEDED_LINE,
  switchesLine,
} from './format';
import { LinesRenderer } from './lines';
import type { ExitHook, LiveFrame, LiveStream } from './live';
import { LIVE_ACTIVITY_DRAW_MS, LIVE_EDIT_DRAW_MS, LIVE_FIRST_DRAW_MS, LiveRenderer } from './live';
import type { GenerationView, ModelChange } from './model';
import { ProgressModel } from './model';
import type { ProgressSetting } from './settings';
import { activeEngineSwitches, resolveProgressSetting } from './settings';

/**
 * The host's output port. Every method writes one complete line, except `live`, which receives the
 * in-place line. Hosts map it to their logger: the CLI writes progress to stderr and results to
 * stdout; Vite uses `server.config.logger.info` (never with `clear`) and, after listen,
 * `{ timestamp: true }`; Angular uses `context.logger.info`.
 */
export interface ProgressWriter {
  /** Progress and notice lines. */
  line(text: string): void;
  /** Result lines (build summary, per-edit line). Defaults to `line`. */
  summary?(text: string): void;
  /** Lines after another writer took the terminal (`foreign`). Defaults to `summary`/`line`. */
  timestampedLine?(text: string): void;
  /** The `json` style: one event per line, for the CLI's `--json` stdout stream. Defaults to `line`. */
  json?(text: string): void;
  /** Where the live line is drawn; without it the reporter never redraws in place. */
  live?: LiveStream & ProgressStream;
}

/** Injectable time source: the reporter's own cadence. Displayed durations come from the session clock. */
export interface ProgressClock {
  now(): number;
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export const systemClock: ProgressClock = {
  now: () => performance.now(),
  setTimeout: (callback, ms) => {
    const handle = setTimeout(callback, ms);
    handle.unref?.();
    return handle;
  },
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * What the reporter still prints once another writer shares the terminal. `notices`: results plus
 * the slow-edit and background notices (the Vite dev server, whose log is NgDoc's to share).
 * `summaries`: results only (the Angular builders after their host starts, the CLI after it
 * spawns a host), because the host's own output owns the terminal.
 */
export type ForeignMode = 'summaries' | 'notices';

export interface ProgressReporterOptions {
  writer: ProgressWriter;
  /** The resolved setting; by default `resolveProgressSetting({ env })`. */
  setting?: ProgressSetting;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  /** Another writer already shares the terminal (`true` means `notices`). */
  foreign?: boolean | ForeignMode;
  /** Named in the LINES start line; defaults to the Nx task project. */
  project?: string;
  clock?: ProgressClock;
  /** Wall clock for GitLab section timestamps; `Date.now` by default. */
  date?: () => number;
  exitHook?: ExitHook;
  /** Used for `$GITHUB_STEP_SUMMARY` (sections only). */
  appendFile?: (file: string, data: string) => void;
  /**
   * The reporter stopped after its writer threw. Called once; hosts report it as the
   * `SESSION_PROGRESS_FAILED` warning (`progressFailure`). Progress never stops a build or a watch.
   */
  onError?: (error: unknown) => void;
}

export interface ProgressReporter {
  readonly environment: ProgressEnvironment;
  /** Feeds one event. Never throws. */
  handle(event: ProgressEvent): void;
  /**
   * Another writer took the terminal: the Vite dev server after it listens (`notices`), the
   * Angular builders after their host starts and the CLI after it spawns a host (`summaries`).
   */
  setForeign(mode?: ForeignMode): void;
  /**
   * The host is about to print its own output (a result's diagnostics): the live line is cleared
   * first, so the output never lands behind it, and it is redrawn on its next frame.
   */
  interrupt(): void;
  /**
   * Clears the live line synchronously and stops. An unfinished generation gets no summary; a
   * superseded one whose successor never started gets its committed result line.
   */
  dispose(): void;
}

/** Slow edits and background work stay quiet unless they run longer than this. */
export const NOTICE_AFTER_MS = 2_000;

type GenerationClass = 'build' | 'edit' | 'background';

interface Tracked {
  view: GenerationView;
  kind: GenerationClass;
  /** Reporter clock when the newest event of the generation arrived. */
  lastEventAt: number;
  noticeDue?: number;
  noticePrinted: boolean;
  printed: boolean;
  section: boolean;
  /** Reporter clock when the work started: earlier when this generation continues another. */
  origin: number;
  /** Reporter clock when this generation started. */
  startedAt: number;
  /** What superseded predecessors committed; the result line reports the whole work. */
  committed?: Committed;
}

interface Committed {
  rebuilt: number;
  written: number;
  removed: number;
  routes: string[];
  phases: ProgressSettledEvent['phases'];
}

/** What a superseded or replaced generation hands to the one that continues its work. */
interface Carry {
  kind: GenerationClass;
  trigger: ProgressTrigger;
  noticePrinted: boolean;
  printed: boolean;
  origin: number;
  committed?: Committed;
  /** The percentage shown so far: a continued build never shows less. */
  fraction: number;
  /**
   * A superseded generation committed: its result, printed on its own if no successor starts
   * before `expiresAt` (or when the reporter is disposed first).
   */
  pending?: ProgressSettledEvent;
  expiresAt?: number;
}

/** How long a superseded generation's result waits for the generation that continues it. */
export const CARRY_EXPIRY_MS = 1_000;

/** Adds a superseded generation's commit to what its predecessors committed. */
function commit(before: Committed | undefined, event: ProgressSettledEvent): Committed {
  const phases = { ...before?.phases };
  for (const [phase, ms] of Object.entries(event.phases) as Array<[ProgressPhase, number]>)
    phases[phase] = (phases[phase] ?? 0) + ms;
  return {
    // The same page or file may be touched by both: the larger count is the honest lower bound,
    // and it never exceeds the real output count.
    rebuilt: Math.max(before?.rebuilt ?? 0, event.counts.rebuilt),
    written: Math.max(before?.written ?? 0, event.counts.written ?? 0),
    removed: Math.max(before?.removed ?? 0, event.counts.removed ?? 0),
    // Newest first: the page the user touched last leads the line.
    routes: [...new Set([...(event.counts.routes ?? []), ...(before?.routes ?? [])])],
    phases,
  };
}

/**
 * The settle as the user sees it, predecessors' commits included (pages, files, routes). A build
 * reports the time since the first start, which is how long the user waited for a ready site; an
 * edit or background run reports its own time.
 */
function whole(event: ProgressSettledEvent, tracked: Tracked): ProgressSettledEvent {
  const build = tracked.kind === 'build';
  const offset = build ? tracked.startedAt - tracked.origin : 0;
  const committed = tracked.committed;
  if (!committed) return offset ? { ...event, elapsedMs: event.elapsedMs + offset } : event;
  const merged = commit(committed, event);
  const counts = { ...event.counts, rebuilt: merged.rebuilt };
  if (merged.written || event.counts.written !== undefined) counts.written = merged.written;
  if (merged.removed || event.counts.removed !== undefined) counts.removed = merged.removed;
  if (merged.routes.length) counts.routes = merged.routes.slice(0, 3);
  return {
    ...event,
    elapsedMs: event.elapsedMs + offset,
    phases: build ? merged.phases : event.phases,
    counts,
  };
}

interface Activity {
  startedAt: number;
  noticePrinted: boolean;
}

const classify = (trigger: ProgressTrigger): GenerationClass =>
  trigger === 'build' ? 'build' : BACKGROUND_TRIGGERS.has(trigger) ? 'background' : 'edit';

/**
 * Creates the reporter for one build session. Use one reporter per session: it follows a single
 * generation sequence and drops events of generations older than the newest it has seen.
 */
export function createProgressReporter(options: ProgressReporterOptions): ProgressReporter {
  return new Reporter(options);
}

class Reporter implements ProgressReporter {
  environment: ProgressEnvironment;
  private readonly writer: ProgressWriter;
  private readonly clock: ProgressClock;
  private readonly env: NodeJS.ProcessEnv;
  private readonly model = new ProgressModel();
  private readonly live: LiveRenderer | undefined;
  private readonly lines: LinesRenderer;
  private foreignMode: ForeignMode | undefined;
  private tracked: Tracked | undefined;
  private carry: Carry | undefined;
  private readonly activities = new Map<ProgressActivityEvent['activity'], Activity>();
  /** The activity the live line shows, if any. */
  private liveActivity: ProgressActivityEvent['activity'] | undefined;
  private timer: unknown;
  private stopped = false;
  private announced = false;
  /** A failure line is the newest result the user saw. */
  private failureReported = false;

  constructor(private readonly options: ProgressReporterOptions) {
    this.writer = options.writer;
    this.clock = options.clock ?? systemClock;
    this.env = options.env ?? process.env;
    this.foreignMode = options.foreign === true ? 'notices' : options.foreign || undefined;
    const setting = options.setting ?? resolveProgressSetting({ env: this.env }).setting;
    this.environment = detectProgressEnvironment({
      setting,
      env: this.env,
      stream: this.writer.live ?? {},
      platform: options.platform,
      foreign: this.foreignMode !== undefined,
    });
    const environment = this.environment;
    const live = this.writer.live;
    this.live =
      environment.style === 'live' && live
        ? new LiveRenderer({
            stream: live,
            unicode: environment.unicode,
            columns: () => {
              const columns = live.columns && live.columns > 0 ? live.columns : 80;
              return environment.nxTask ? Math.min(columns, NX_TASK_COLUMNS) : columns;
            },
            bar: !environment.nxTask,
            exitHook: options.exitHook,
          })
        : undefined;
    this.lines = new LinesRenderer({
      print: (text) => this.print(text),
      service: (text) => this.service(text),
      heartbeatMs: environment.heartbeatMs,
      compact: environment.nxShared,
      assist: environment.ciAssist ? environment.ci : undefined,
      project:
        plainText(options.project ?? this.env['NX_TASK_TARGET_PROJECT'] ?? '').trim() || undefined,
    });
  }

  handle(event: ProgressEvent): void {
    if (this.stopped || this.environment.style === 'off') return;
    this.guard(() => {
      const change = this.model.apply(event);
      if (!change) return;
      const now = this.clock.now();
      if (this.environment.style === 'json') {
        const text = JSON.stringify(event);
        if (this.writer.json) this.writer.json(text);
        else this.writer.line(text);
        return;
      }
      this.apply(change, now);
      this.schedule(now);
    });
  }

  setForeign(mode: ForeignMode = 'notices'): void {
    if (this.stopped || this.foreignMode === mode) return;
    this.guard(() => {
      this.foreignMode = mode;
      this.environment = { ...this.environment, foreign: true };
      this.live?.stop();
      this.liveActivity = undefined;
      this.lines.stop();
      if (!this.notices) {
        if (this.tracked) this.tracked.noticeDue = undefined;
      } else if (this.tracked && !this.tracked.noticePrinted && this.tracked.kind !== 'build')
        this.tracked.noticeDue ??= this.clock.now() + NOTICE_AFTER_MS;
      this.schedule(this.clock.now());
    });
  }

  interrupt(): void {
    if (this.stopped) return;
    this.guard(() => this.live?.clear());
  }

  dispose(): void {
    if (this.stopped) return;
    // Committed work without a successor still gets its line.
    if (this.carry) this.guard(() => this.flushCarry());
    this.stopped = true;
    this.cancelTimer();
    this.tracked = undefined;
    this.carry = undefined;
    this.activities.clear();
    try {
      this.live?.stop();
    } catch {
      /* Disposal must finish. */
    }
  }

  /** Notices (slow edits, background work, warm-up) may be printed. */
  private get notices(): boolean {
    return this.environment.style !== 'summary' && this.foreignMode !== 'summaries';
  }

  private apply(change: ModelChange, now: number): void {
    switch (change.kind) {
      case 'started':
        return this.started(change.view, now);
      case 'progress': {
        const tracked = this.tracked;
        if (!tracked) return;
        tracked.lastEventAt = now;
        if (change.passRestarted && this.environment.verbose) this.print(restartLine(change.view));
        this.live?.touch();
        if (this.lines.tracking) this.lines.update(now);
        return;
      }
      case 'settled':
        return this.settled(change.event);
      case 'activity':
        return this.activityChange(change.event, now);
    }
  }

  private started(view: GenerationView, now: number): void {
    this.announce();
    // A generation that did not settle was replaced; one that settled as superseded left a carry.
    // Either way the new generation finishes that work: a build stays a build (one summary), and a
    // printed notice is answered by the new generation's line.
    const previous = this.tracked;
    let carry = this.carry;
    this.carry = undefined;
    if (previous) {
      this.endRenderers();
      carry = {
        kind: previous.kind,
        trigger: previous.view.trigger,
        noticePrinted: previous.noticePrinted,
        printed: previous.printed,
        origin: previous.origin,
        fraction: previous.view.fraction,
        ...(previous.committed ? { committed: previous.committed } : {}),
      };
    }
    // The shown percentage continues from the work this generation takes over.
    if (carry) view.fraction = Math.max(view.fraction, carry.fraction);
    if (this.liveActivity) {
      this.live?.stop();
      this.liveActivity = undefined;
    }
    const own = classify(view.trigger);
    const kind: GenerationClass = carry?.kind === 'build' ? 'build' : own;
    if (
      carry?.printed &&
      kind === 'build' &&
      this.environment.style === 'lines' &&
      !this.foreignMode
    )
      this.print(RESTARTING_LINE);
    const tracked: Tracked = {
      view,
      kind,
      lastEventAt: now,
      noticePrinted: carry?.noticePrinted ?? false,
      printed: false,
      section: false,
      origin: carry?.origin ?? now,
      startedAt: now,
      ...(carry?.committed ? { committed: carry.committed } : {}),
    };
    this.tracked = tracked;
    const { style, verbose } = this.environment;
    const redraw = style === 'live' && !this.foreignMode && !!this.live;
    if (kind === 'build') {
      if (redraw) this.live!.track((at) => this.frame(tracked, at), now, LIVE_FIRST_DRAW_MS);
      else if (style === 'lines' && !this.foreignMode) {
        if (this.environment.sections) {
          const open = sectionStart(
            this.environment.ci,
            `${PREFIX} generating documentation (${view.mode})`,
            (this.options.date ?? Date.now)(),
          );
          if (open) {
            this.service(open);
            tracked.section = true;
          }
        }
        this.lines.track(view, (at) => this.elapsed(tracked, at), now);
        tracked.printed = true;
      }
    } else if (kind === 'edit') {
      if (redraw) this.live!.track((at) => this.frame(tracked, at), now, LIVE_EDIT_DRAW_MS);
      else if (this.notices && !tracked.noticePrinted) tracked.noticeDue = now + NOTICE_AFTER_MS;
    } else if (tracked.noticePrinted) {
      // Already announced by the generation it replaced.
    } else if (verbose && this.notices) this.notice(tracked, backgroundNotice(view.trigger));
    else if (this.notices) tracked.noticeDue = now + NOTICE_AFTER_MS;
  }

  private settled(settle: ProgressSettledEvent): void {
    const tracked = this.tracked;
    if (!tracked) return;
    const event = whole(settle, tracked);
    this.tracked = undefined;
    this.endRenderers(tracked);
    if (event.status === 'superseded') {
      // The newer generation follows and reports the whole work, this commit included.
      this.carry = {
        kind: tracked.kind,
        trigger: tracked.view.trigger,
        noticePrinted: tracked.noticePrinted,
        printed: tracked.printed,
        origin: tracked.origin,
        committed: commit(tracked.committed, settle),
        fraction: tracked.view.fraction,
        pending: { ...event, status: 'success' },
        expiresAt: this.clock.now() + CARRY_EXPIRY_MS,
      };
      if (this.environment.verbose) this.print(SUPERSEDED_LINE);
      return;
    }
    this.report(tracked.kind, tracked.view.trigger, tracked.noticePrinted, event);
  }

  /** A superseded generation's result, when nothing continued it. */
  private flushCarry(): void {
    const carry = this.carry;
    this.carry = undefined;
    if (carry?.pending) this.report(carry.kind, carry.trigger, carry.noticePrinted, carry.pending);
  }

  /** Prints the result line of finished work, if its class and outcome call for one. */
  private report(
    kind: GenerationClass,
    trigger: ProgressTrigger,
    noticePrinted: boolean,
    event: ProgressSettledEvent,
  ): void {
    const { verbose, color } = this.environment;
    const what = kind === 'background' ? backgroundLabel(trigger) : 'update';
    let result: string | undefined;
    if (kind === 'build')
      result =
        event.status === 'success' && this.failureReported
          ? resolvedBuildLine(event, color)
          : buildSummary(event, color);
    else if (event.status === 'failure') result = editFailureLine(event, what);
    else if (event.status === 'cancelled') {
      // A notice must not be left without an answer.
      if (noticePrinted) result = cancelledLine(what, event);
    } else if (this.failureReported) {
      // A fix must be visible: the first success after a reported failure always prints, even
      // from background work that would otherwise stay hidden.
      result = resolvedLine(event);
    } else if (kind === 'edit') {
      // Every completed edit ends with exactly one line, including sub-second and no-op edits.
      result = editLine(event) ?? noChangesLine(event);
    } else if (noticePrinted) result = backgroundDone(trigger, event);
    if (event.status === 'failure') this.failureReported = true;
    else if (event.status === 'success') this.failureReported = false;
    if (result !== undefined) {
      this.result(result);
      if (kind === 'build' && this.environment.sections && this.environment.ci === 'github')
        appendStepSummary(this.env, buildSummary(event, false), this.options.appendFile);
    }
    if (verbose) {
      const phases = phasesLine(event);
      if (phases) this.print(phases);
    }
  }

  private activityChange(event: ProgressActivityEvent, now: number): void {
    const kind = event.activity;
    if (event.state === 'start') {
      this.announce();
      this.stopActivity(kind);
      const activity: Activity = { startedAt: now, noticePrinted: false };
      this.activities.set(kind, activity);
      const { style, verbose } = this.environment;
      if (kind === 'checking-inputs') {
        // Routine and short: shown only in a live line, only past 1 s, and never over a generation.
        if (style === 'live' && !this.foreignMode && this.live && !this.tracked) {
          this.liveActivity = kind;
          this.live.track(
            (at) => ({ body: activityLabel(kind), elapsedMs: at - activity.startedAt }),
            now,
            LIVE_ACTIVITY_DRAW_MS,
          );
        }
      } else if (verbose && this.notices) {
        // The warm-up is routine background work: shown in verbose output only (its failure
        // always prints, below).
        this.print(activityNotice(kind));
        activity.noticePrinted = true;
      }
      return;
    }
    const activity = this.activities.get(kind);
    this.stopActivity(kind);
    const duration =
      event.elapsedMs > 0 ? event.elapsedMs : activity ? now - activity.startedAt : 0;
    // A failure always prints; a finish only answers a printed notice.
    if (event.failed || activity?.noticePrinted) this.print(activityDone(event, duration));
  }

  private stopActivity(kind: ProgressActivityEvent['activity']): void {
    if (this.liveActivity === kind) {
      this.live?.stop();
      this.liveActivity = undefined;
    }
    this.activities.delete(kind);
  }

  private wake(): void {
    this.timer = undefined;
    if (this.stopped) return;
    this.guard(() => {
      const now = this.clock.now();
      if (this.carry?.expiresAt !== undefined && now >= this.carry.expiresAt) this.flushCarry();
      const tracked = this.tracked;
      if (tracked?.noticeDue !== undefined && now >= tracked.noticeDue) {
        tracked.noticeDue = undefined;
        if (tracked.kind === 'edit' && this.environment.verbose && tracked.view.restarted)
          tracked.noticePrinted = true;
        else
          this.notice(
            tracked,
            tracked.kind === 'background'
              ? backgroundNotice(tracked.view.trigger)
              : slowEditLine(tracked.view),
          );
      }
      this.live?.wake(now);
      this.lines.wake(now);
      this.schedule(now);
    });
  }

  private notice(tracked: Tracked, text: string): void {
    tracked.noticePrinted = true;
    tracked.printed = true;
    this.print(text);
  }

  private schedule(now: number): void {
    this.cancelTimer();
    const due = [
      this.live?.nextWake(),
      this.lines.nextWake(),
      this.tracked?.noticeDue,
      this.carry?.expiresAt,
    ].filter((value): value is number => value !== undefined);
    if (!due.length) return;
    this.timer = this.clock.setTimeout(() => this.wake(), Math.max(0, Math.min(...due) - now));
  }

  private cancelTimer(): void {
    if (this.timer === undefined) return;
    this.clock.clearTimeout(this.timer);
    this.timer = undefined;
  }

  private endRenderers(tracked: Tracked | undefined = this.tracked): void {
    if (!this.liveActivity) this.live?.stop();
    this.lines.stop();
    if (tracked?.section) {
      tracked.section = false;
      const close = sectionEnd(this.environment.ci, (this.options.date ?? Date.now)());
      if (close) this.service(close);
    }
  }

  private frame(tracked: Tracked, now: number): LiveFrame {
    const view = tracked.view;
    return {
      body: stepText(view, { live: true }),
      elapsedMs: this.elapsed(tracked, now),
      ...(view.stepped ? { fraction: view.fraction } : {}),
    };
  }

  /**
   * Session elapsed time, extrapolated with the reporter clock since the newest event, plus the
   * time of the generations this one continues.
   */
  private elapsed(tracked: Tracked, now: number): number {
    return (
      tracked.view.elapsedMs +
      Math.max(0, now - tracked.lastEventAt) +
      (tracked.startedAt - tracked.origin)
    );
  }

  /** One line when an engine switch is set, before the first output: slow edits explain themselves. */
  private announce(): void {
    if (this.announced) return;
    this.announced = true;
    const switches = activeEngineSwitches(this.env);
    if (switches.length) this.print(switchesLine(switches));
  }

  /** A progress or notice line. Free text in it can never act as a CI service message. */
  private print(text: string): void {
    this.emit(neutralizeServiceMessages(text), false);
    if (this.tracked) this.tracked.printed = true;
  }

  /** A CI service message or section marker, written verbatim. */
  private service(text: string): void {
    this.emit(text, false);
  }

  /** A result line: the build summary or the per-edit line. */
  private result(text: string): void {
    this.emit(neutralizeServiceMessages(text), true);
  }

  private emit(text: string, result: boolean): void {
    this.live?.clear();
    const writer = this.writer;
    if (this.foreignMode && writer.timestampedLine) writer.timestampedLine(text);
    else if (result && writer.summary) writer.summary(text);
    else writer.line(text);
  }

  private guard(action: () => void): void {
    try {
      action();
    } catch (error) {
      this.stopped = true;
      this.cancelTimer();
      try {
        this.live?.stop();
      } catch {
        /* The writer is already failing. */
      }
      try {
        this.options.onError?.(error);
      } catch {
        /* Progress must never break its caller. */
      }
    }
  }
}
