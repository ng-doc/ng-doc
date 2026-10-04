import type {
  ProgressActivityEvent,
  ProgressPhase,
  ProgressSettledEvent,
  ProgressTrigger,
} from './events';
import { PROGRESS_PHASES } from './events';
import type { GenerationView } from './model';
import { PROGRESS_STEPS, stepOf } from './model';

/**
 * All user-facing text. Lines are ASCII-only; the live line may use a spinner and a
 * bar. Colour is decoration only and is applied by `paint`.
 */
export const PREFIX = 'NgDoc:';

/**
 * `0.9s`, `9.8s`, `21s`, `1m 05s`. `coarse` drops the tenths, so a redrawn line changes at most
 * once per second because of the clock.
 */
export function formatDuration(ms: number, coarse: boolean = false): string {
  const seconds = Math.max(0, ms) / 1000;
  if (seconds < 10 && !coarse) return `${(Math.floor(seconds * 10) / 10).toFixed(1)}s`;
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${String(Math.floor(seconds - minutes * 60)).padStart(2, '0')}s`;
}

export const plural = (n: number, noun: string): string => `${n} ${noun}${n === 1 ? '' : 's'}`;

export const paint = (text: string, code: number, enabled: boolean): string =>
  enabled ? `\x1b[${code}m${text}\x1b[39m` : text;

const PREPARING: Partial<Record<ProgressPhase, string>> = {
  boot: 'starting',
  discovery: 'reading configuration',
  restore: 'checking recorded inputs',
  semantic: 'analyzing TypeScript',
  plan: 'collecting pages',
  describe: 'collecting pages',
};

export interface StepTextOptions {
  /** Live line: `preparing: detail` and no percentage parentheses change. */
  live?: boolean;
  /**
   * Totals only (`rendering 664 pages`): for the one line printed when a step starts, where a
   * count of zero would only say the step began. Live lines and heartbeats show `312/664`.
   */
  totals?: boolean;
  /** `false` leaves out the percentage, for consumers that show it on their own. */
  percent?: boolean;
}

/** The step and its counts, without prefix or timing: `[2/4] rendering 312/664 pages (48%)`. */
export function stepText(view: GenerationView, options: StepTextOptions = {}): string {
  const phase = view.phase;
  if (!view.stepped) {
    if (phase === 'boot') return 'generating documentation (starting)';
    if (phase === 'transfer' || phase === 'commit') return writing(view);
    return 'generating documentation';
  }
  const index = phase ? stepOf(phase) : 0;
  const step = PROGRESS_STEPS[index];
  let text = `[${index + 1}/${PROGRESS_STEPS.length}] `;
  if (step.label === 'preparing') {
    const detail = phase ? PREPARING[phase] : undefined;
    text += detail
      ? options.live
        ? `preparing: ${detail}`
        : `preparing (${detail})`
      : 'preparing';
  } else if (step.label === 'writing') text += writing(view);
  else
    text += `${step.label} ${pages(view, step.label === 'rendering' ? 'render' : 'link', options.totals)}`;
  return options.percent === false
    ? text.trimEnd()
    : `${text.trimEnd()} (${Math.floor(view.fraction * 100)}%)`;
}

/**
 * `completed/total` while the phase runs (from `0/664` at its start, so a redrawn count never
 * drops), or the total alone once it ended or when `totals` asks for it.
 */
function progressCount(
  view: GenerationView,
  phase: 'render' | 'link',
  totals: boolean = false,
): string | undefined {
  const total = view.totals[phase];
  if (total === undefined) return undefined;
  return !totals && view.phase === phase && view.phaseState !== 'end'
    ? `${view.completed ?? 0}/${total}`
    : String(total);
}

function pages(view: GenerationView, phase: 'render' | 'link', totals?: boolean): string {
  const count = progressCount(view, phase, totals);
  if (count === undefined) return 'pages';
  return count.includes('/') ? `${count} pages` : plural(Number(count), 'page');
}

function writing(view: GenerationView): string {
  const total = view.totals['commit'];
  return total === undefined ? 'writing files' : `writing ${plural(total, 'file')}`;
}

/** Compact text for the Nx TUI and stream styles, where a pane may be about 46 columns wide. */
export function compactText(
  view: GenerationView,
  elapsedMs: number,
  totals: boolean = false,
): string {
  if (!view.stepped) return `${PREFIX} ${stepText(view)}, ${formatDuration(elapsedMs)}`;
  const phase = view.phase;
  const index = phase ? stepOf(phase) : 0;
  const label = PROGRESS_STEPS[index].label;
  let counts = '';
  if (label === 'rendering' || label === 'linking') {
    const count = progressCount(view, label === 'rendering' ? 'render' : 'link', totals);
    // The noun keeps the page count apart from the percentage (`445 pages, 35%`, not `445 35%`).
    if (count !== undefined)
      counts = ` ${count.includes('/') ? `${count} pages` : plural(Number(count), 'page')},`;
  }
  return `${PREFIX} ${label}${counts} ${Math.floor(view.fraction * 100)}%, ${formatDuration(elapsedMs)}`;
}

/**
 * LINES mode: `NgDoc: [2/4] rendering 664 pages (35%), 6.9s elapsed` when a step starts (`totals`),
 * `NgDoc: [2/4] rendering 312/664 pages (48%), 16s elapsed` on a heartbeat.
 */
export function stepLine(view: GenerationView, elapsedMs: number, totals: boolean = false): string {
  const elapsed = elapsedMs >= 1000 ? `, ${formatDuration(elapsedMs)} elapsed` : '';
  return `${PREFIX} ${stepText(view, { totals })}${elapsed}`;
}

/** The first line of a LINES build: `NgDoc: generating documentation for docs (production)`. */
export function startLine(
  view: GenerationView,
  project?: string,
  compact: boolean = false,
): string {
  if (compact) return `${PREFIX} started (${view.mode})`;
  return `${PREFIX} generating documentation${project ? ` for ${project}` : ''} (${view.mode})`;
}

const SPINNER_UNICODE = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const SPINNER_ASCII = ['-', '\\', '|', '/'];
/** Short: every bar cell is three bytes of UTF-8 in each redraw an Nx cache replays. */
const BAR_WIDTH = 12;

export interface LiveTextOptions {
  frame: number;
  unicode: boolean;
  /** Terminal columns; the text never exceeds `columns - 1`, so it never wraps. */
  columns: number;
  /** Draw the bar when it fits (not under Nx). */
  bar: boolean;
}

/** `⠼ NgDoc [2/4] rendering 312/664 pages (48%) · 9.4s ━━━━━━━━──────────`. */
export function liveText(
  body: string,
  elapsedMs: number,
  fraction: number | undefined,
  options: LiveTextOptions,
): string {
  const frames = options.unicode ? SPINNER_UNICODE : SPINNER_ASCII;
  const spinner = frames[options.frame % frames.length];
  const separator = options.unicode ? ' · ' : ', ';
  const text = `${spinner} NgDoc ${body}${separator}${formatDuration(elapsedMs, true)}`;
  const width = Math.max(1, options.columns - 1);
  if (options.bar && fraction !== undefined && [...text].length + 1 + BAR_WIDTH <= width) {
    const filled = Math.round(Math.min(1, Math.max(0, fraction)) * BAR_WIDTH);
    const [on, off] = options.unicode ? ['━', '─'] : ['#', '-'];
    return `${text} ${on.repeat(filled)}${off.repeat(BAR_WIDTH - filled)}`;
  }
  return truncate(text, width, options.unicode);
}

/** Cuts `text` to at most `width` code points. */
export function truncate(text: string, width: number, unicode: boolean): string {
  const points = [...text];
  if (points.length <= width) return text;
  return unicode ? `${points.slice(0, width - 1).join('')}…` : points.slice(0, width).join('');
}

const TIMING_GROUPS: ReadonlyArray<[string, readonly ProgressPhase[]]> = [
  ['analyze', ['semantic']],
  ['render', ['render', 'keywords']],
  ['link', ['link', 'assemble', 'aggregate']],
  ['write', ['persist', 'transfer', 'commit']],
];

/** `analyze 4.7s, render 5.1s, link 2.0s, write 4.4s`, for the groups that ran. */
export function timingText(phases: ProgressSettledEvent['phases']): string {
  return TIMING_GROUPS.flatMap(([label, members]) => {
    const present = members.filter((phase) => typeof phases[phase] === 'number');
    if (!present.length) return [];
    return [
      `${label} ${formatDuration(present.reduce((sum, phase) => sum + (phases[phase] ?? 0), 0))}`,
    ];
  }).join(', ');
}

const errorsText = (errors: number): string => plural(errors, 'error');

/** The build summary: every build ends with exactly one line, `OK` or `FAILED`. */
export function buildSummary(event: ProgressSettledEvent, color: boolean): string {
  const counts = event.counts;
  const elapsed = formatDuration(event.elapsedMs);
  if (event.status === 'failure') {
    const errors = counts.errors > 0 ? `${errorsText(counts.errors)}, see above` : 'see above';
    return `${PREFIX} ${paint('FAILED', 31, color)} generation failed after ${elapsed} (${errors})`;
  }
  if (event.status === 'cancelled') return `${PREFIX} generation cancelled after ${elapsed}`;
  // A fast start compiled nothing: it published the recorded pages, whose inputs are unchanged.
  const restored = event.pass === 'restored';
  const parts = [
    `${PREFIX} ${paint('OK', 32, color)} ${restored ? 'restored' : 'generated'} ${plural(counts.pages, 'page')} in ${elapsed}${restored ? ' (inputs unchanged)' : ''}`,
  ];
  const work: string[] = [];
  if (counts.rebuilt < counts.pages && !restored) work.push(`${counts.rebuilt} rebuilt`);
  if (counts.written)
    work.push(
      `${plural(counts.written, 'file')} written${counts.removed ? `, ${counts.removed} removed` : ''}`,
    );
  else if (counts.removed) work.push(`${plural(counts.removed, 'file')} removed`);
  else if (counts.unchanged !== undefined)
    work.push(`${plural(counts.unchanged, 'file')} unchanged`);
  if (work.length) parts.push(work.join(', '));
  const timings = counts.rebuilt > 0 ? timingText(event.phases) : '';
  if (timings) parts.push(timings);
  if (counts.warnings) parts.push(plural(counts.warnings, 'warning'));
  return parts.join('; ');
}

/** The work an edit did: `1 of 664 pages (/route, +2)`, `664 pages`, `3 files`; `undefined` when nothing changed. */
export function editWork(event: ProgressSettledEvent): string | undefined {
  const { pages, rebuilt, routes, written = 0, removed = 0 } = event.counts;
  if (rebuilt > 0) {
    const scope =
      rebuilt >= pages ? plural(rebuilt, 'page') : `${rebuilt} of ${plural(pages, 'page')}`;
    const first = routes?.find((route) => typeof route === 'string' && route.length > 0);
    const where = first ? ` (${first}${rebuilt > 1 ? `, +${rebuilt - 1}` : ''})` : '';
    return `${scope}${where}`;
  }
  if (written + removed > 0) return plural(written + removed, 'file');
  return undefined;
}

/** `NgDoc: updated 1 of 664 pages in 0.9s (/getting-started/installation)`; `undefined` for an unchanged save. */
export function editLine(event: ProgressSettledEvent): string | undefined {
  const work = editWork(event);
  if (!work) return undefined;
  const at = work.indexOf(' (');
  const [scope, where] = at < 0 ? [work, ''] : [work.slice(0, at), work.slice(at)];
  return `${PREFIX} updated ${scope} in ${formatDuration(event.elapsedMs)}${where}`;
}

/** A build that succeeded after a reported failure: one line that says both. */
export const resolvedBuildLine = (event: ProgressSettledEvent, color: boolean): string =>
  `${PREFIX} error resolved;${buildSummary(event, color).slice(PREFIX.length)}`;

/** An edit or background run that printed a notice and was then cancelled (nothing committed). */
export const cancelledLine = (what: string, event: ProgressSettledEvent): string =>
  `${PREFIX} ${what} cancelled after ${formatDuration(event.elapsedMs)}`;

/** An edit that completed without changing a page or a file. */
export const noChangesLine = (event: ProgressSettledEvent): string =>
  `${PREFIX} finished in ${formatDuration(event.elapsedMs)}; no changes`;

/** The first success after a reported failure: `NgDoc: error resolved; updated 1 of 664 pages …`. */
export function resolvedLine(event: ProgressSettledEvent): string {
  const line = editLine(event) ?? noChangesLine(event);
  return `${PREFIX} error resolved;${line.slice(PREFIX.length)}`;
}

/** `NgDoc: update failed (1 error above); the site keeps the last good version`. */
export function editFailureLine(event: ProgressSettledEvent, what: string = 'update'): string {
  const errors = event.counts.errors > 0 ? ` (${errorsText(event.counts.errors)} above)` : '';
  return `${PREFIX} ${what} failed${errors}; the site keeps the last good version`;
}

/** The notice for an edit still running after 2 s. */
export function slowEditLine(view: GenerationView): string {
  if (view.pass === 'full' && (view.restarted || view.reason))
    return `${PREFIX} rebuilding all pages${view.reason ? ` (${view.reason})` : ''}...`;
  return `${PREFIX} updating${view.changes > 0 ? ` (${plural(view.changes, 'file')} changed)` : ''}...`;
}

const BACKGROUND: Partial<Record<ProgressTrigger, string>> = {
  'follow-up': 'catching up with missed changes',
  confirmation: 'confirming the last update',
  audit: 'checking generated files',
};

export const backgroundLabel = (trigger: ProgressTrigger): string =>
  BACKGROUND[trigger] ?? 'updating in the background';

export const backgroundNotice = (trigger: ProgressTrigger): string =>
  `${PREFIX} ${backgroundLabel(trigger)}...`;

/** `NgDoc: checking generated files finished in 3.4s; updated 2 files`. */
export function backgroundDone(trigger: ProgressTrigger, event: ProgressSettledEvent): string {
  const work = editWork(event);
  return `${PREFIX} ${backgroundLabel(trigger)} finished in ${formatDuration(event.elapsedMs)}; ${work ? `updated ${work}` : 'no changes'}`;
}

const ACTIVITY: Record<ProgressActivityEvent['activity'], [string, string]> = {
  'checking-inputs': ['checking inputs', 'input check'],
  'warming-up': ['warming up', 'warm-up'],
};

export const activityLabel = (activity: ProgressActivityEvent['activity']): string =>
  ACTIVITY[activity][0];

export const activityNotice = (activity: ProgressActivityEvent['activity']): string =>
  `${PREFIX} ${ACTIVITY[activity][0]}...`;

export function activityDone(event: ProgressActivityEvent, durationMs: number): string {
  const [, noun] = ACTIVITY[event.activity];
  if (event.failed)
    return `${PREFIX} ${noun} failed after ${formatDuration(durationMs)}; the next update may be slower`;
  return event.stopped
    ? `${PREFIX} ${noun} stopped after ${formatDuration(durationMs)}`
    : `${PREFIX} ${noun} finished in ${formatDuration(durationMs)}`;
}

export const SUPERSEDED_LINE = `${PREFIX} superseded by newer changes`;
export const RESTARTING_LINE = `${PREFIX} inputs changed, restarting`;

/** Verbose: `NgDoc: phases (full pass: tsconfig.json changed): boot 0.8s, discovery 0.3s, …`. */
export function phasesLine(event: ProgressSettledEvent): string | undefined {
  const entries = PROGRESS_PHASES.filter((phase) => typeof event.phases[phase] === 'number');
  if (!entries.length) return undefined;
  const pass =
    event.pass === 'restored'
      ? ' (fast start)'
      : event.pass
        ? ` (${event.pass} pass${event.reason ? `: ${event.reason}` : ''})`
        : '';
  return `${PREFIX} phases${pass}: ${entries.map((phase) => `${phase} ${formatDuration(event.phases[phase] ?? 0)}`).join(', ')}`;
}

/** Verbose, on a targeted → FULL restart. */
export const restartLine = (view: GenerationView): string =>
  `${PREFIX} rebuilding all pages${view.reason ? ` (${view.reason})` : ''}`;

/** One line naming the engine switches that are set. */
export const switchesLine = (switches: readonly string[]): string =>
  `${PREFIX} engine switches set: ${switches.join(', ')}; builds and edits may be slower`;
