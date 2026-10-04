import type { ProgressSetting } from './settings';
import { sectionsEnabled } from './settings';

/** CI vendors the reporter distinguishes (same set as Nx `isCI()`). */
export type CiVendor =
  | 'github'
  | 'gitlab'
  | 'azure'
  | 'teamcity'
  | 'buildkite'
  | 'jenkins'
  | 'circleci'
  | 'generic';

/**
 * `live`: one line redrawn in place. `lines`: append-only ASCII lines. `summary`: final lines only.
 * `json`: the events themselves, one JSON line each. `off`: nothing.
 */
export type ProgressStyle = 'live' | 'lines' | 'summary' | 'json' | 'off';

/** The terminal the live line would draw on (normally `process.stderr`). */
export interface ProgressStream {
  isTTY?: boolean;
  columns?: number;
  hasColors?: () => boolean;
}

export interface DetectOptions {
  setting: ProgressSetting;
  env?: NodeJS.ProcessEnv;
  stream?: ProgressStream;
  platform?: NodeJS.Platform;
  /**
   * Another writer shares the terminal: the Vite dev server after it listens, the CLI after it
   * spawns a host.
   */
  foreign?: boolean;
}

export interface ProgressEnvironment {
  setting: ProgressSetting;
  style: ProgressStyle;
  /** `verbose`: LINES plus phase timings, the FULL-pass reason and background notices. */
  verbose: boolean;
  ci?: CiVendor;
  tty: boolean;
  dumb: boolean;
  color: boolean;
  unicode: boolean;
  /** Live text is cut to `columns - 1`. */
  columns: number;
  /** Running as an Nx task. */
  nxTask: boolean;
  /** Nx TUI or `--output-style=stream*`: several tasks share the screen; no in-place redraw. */
  nxShared: boolean;
  /** Nx prefixes every line (`project: …`), which breaks CI commands. */
  nxPrefix: boolean;
  /** Invisible Azure/TeamCity progress service messages. */
  ciAssist: boolean;
  /** Opt-in GitHub/GitLab groups and step summary. */
  sections: boolean;
  /** LINES heartbeat: 15 s on CI, 5 s under Nx shared output, 10 s otherwise. */
  heartbeatMs: number;
  foreign: boolean;
}

/** The Nx 23 task PTY reports the whole terminal, not the pane: keep live text short under Nx. */
export const NX_TASK_COLUMNS = 56;

export function detectCi(env: NodeJS.ProcessEnv): CiVendor | undefined {
  if (env['CI'] === 'false') return undefined;
  if (env['GITHUB_ACTIONS'] === 'true') return 'github';
  if (env['GITLAB_CI']) return 'gitlab';
  if (env['TF_BUILD'] === 'True' || env['TF_BUILD'] === 'true') return 'azure';
  if (env['TEAMCITY_VERSION']) return 'teamcity';
  if (env['BUILDKITE'] === 'true') return 'buildkite';
  if (env['JENKINS_URL'] || env['HUDSON_URL']) return 'jenkins';
  if (env['CIRCLECI'] === 'true') return 'circleci';
  if (env['CI'] || env['BUILD_NUMBER'] || env['BUILD_ID'] || env['CODEBUILD_BUILD_ID'])
    return 'generic';
  return undefined;
}

/**
 * Chooses the output style. In-place redraw needs a TTY that NgDoc owns: not CI (Buildkite runs a
 * PTY), not Nx shared output (the task PTY reports the whole terminal width, so redrawn lines
 * pile up in a pane), and no foreign writer. A single Nx task on a TTY does get the live line.
 */
export function detectProgressEnvironment(options: DetectOptions): ProgressEnvironment {
  const env = options.env ?? process.env;
  const stream = options.stream ?? {};
  const platform = options.platform ?? process.platform;
  const foreign = options.foreign === true;
  const setting = options.setting;
  const ci = detectCi(env);
  const tty = stream.isTTY === true;
  const dumb = env['TERM'] === 'dumb';
  const nxTask = !!env['NX_TASK_TARGET_PROJECT'];
  const nxShared = nxTask && env['NX_STREAM_OUTPUT'] === 'true';
  const nxPrefix = env['NX_PREFIX_OUTPUT'] === 'true';
  const canRedraw = tty && !dumb && !foreign;
  let style: ProgressStyle;
  if (setting === 'off') style = 'off';
  else if (setting === 'json') style = 'json';
  else if (setting === 'summary') style = 'summary';
  else if (setting === 'plain' || setting === 'verbose') style = 'lines';
  else if (setting === 'live') style = canRedraw ? 'live' : 'lines';
  else style = canRedraw && !ci && !nxShared ? 'live' : 'lines';
  let color: boolean;
  const noColor = env['NO_COLOR'];
  const forceColor = env['FORCE_COLOR'];
  if (noColor !== undefined && noColor !== '') color = false;
  else if (forceColor !== undefined) color = forceColor !== '0' && forceColor !== 'false';
  else color = tty && !dumb && (typeof stream.hasColors !== 'function' || stream.hasColors());
  const unicode =
    style === 'live' &&
    (platform !== 'win32' || !!env['WT_SESSION'] || env['TERM_PROGRAM'] === 'vscode');
  const raw = stream.columns && stream.columns > 0 ? stream.columns : 80;
  const columns = nxTask ? Math.min(raw, NX_TASK_COLUMNS) : raw;
  const human = style === 'lines' || style === 'summary' || style === 'live';
  return {
    setting,
    style,
    verbose: setting === 'verbose',
    ci,
    tty,
    dumb,
    color,
    unicode,
    columns,
    nxTask,
    nxShared,
    nxPrefix,
    ciAssist:
      style === 'lines' &&
      (ci === 'azure' || ci === 'teamcity') &&
      !nxPrefix &&
      setting !== 'plain',
    sections: human && (ci === 'github' || ci === 'gitlab') && !nxPrefix && sectionsEnabled(env),
    heartbeatMs: ci ? 15_000 : nxShared ? 5_000 : 10_000,
    foreign,
  };
}
