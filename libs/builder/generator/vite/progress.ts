import type { Logger, ResolvedConfig } from 'vite';

import type { GeneratorBootstrapOptions } from '../bootstrap';
import type { ProgressStream } from '../progress/detect';
import { type HostProgress, createHostProgress } from '../progress/host';
import type { LiveStream } from '../progress/live';
import { type ProgressOptionSetting, resolveProgressSetting } from '../progress/settings';

export interface ViteProgressOptions {
  /** The logger to write to at the time of writing: the dev server's, else the resolved config's. */
  logger(): Logger | undefined;
  /** The plugin option `progress`. */
  option?: ProgressOptionSetting;
  /** Vite `logLevel`: `warn`, `error` and `silent` turn progress off unless a setting asks for it. */
  logLevel?: ResolvedConfig['logLevel'];
  generator: GeneratorBootstrapOptions;
  /** The terminal (`process.stderr`): the live line, and every line when the log level hides info. */
  stderr?: LiveStream & ProgressStream;
}

const QUIET_LEVELS: ReadonlySet<string> = new Set(['warn', 'error', 'silent']);

/**
 * NgDoc progress in Vite: lines through the Vite logger (never with `clear`, so Vite keeps the
 * screen and its banner follows the NgDoc summary), the live line on stderr until the dev server
 * serves, and timestamped lines after that (`3:04:27 PM [vite] NgDoc: updated …`).
 *
 * - A Vite `logLevel` that hides info (`warn`, `error`, `silent`) turns progress off. A setting
 *   that asks for progress anyway (`NGDOC_PROGRESS` or the plugin option, other than `auto`) is
 *   honoured: its lines go straight to stderr, untimestamped, since the logger would drop them.
 * - Vite's logger clears the screen for a message identical to the one before it and prints
 *   `(xN)`. An NgDoc line identical to NgDoc's previous one therefore says how often it repeated
 *   (`… (2 in a row)`), which keeps the terminal history.
 * - A writer that throws stops progress and logs one `SESSION_PROGRESS_FAILED` warning.
 */
export function createViteProgress(options: ViteProgressOptions): HostProgress | undefined {
  const { setting } = resolveProgressSetting({
    ...(options.option ? { option: options.option } : {}),
    ...(options.logLevel ? { host: { viteLogLevel: options.logLevel } } : {}),
  });
  if (setting === 'off') return undefined;
  const stderr = options.stderr ?? process.stderr;
  const quiet = options.logLevel !== undefined && QUIET_LEVELS.has(options.logLevel);
  let previous: string | undefined;
  let repeats = 1;
  const write = (text: string, timestamp: boolean) => {
    repeats = text === previous ? repeats + 1 : 1;
    previous = text;
    const line = repeats > 1 ? `${text} (${repeats} in a row)` : text;
    if (quiet) stderr.write(`${line}\n`);
    else options.logger()?.info(line, timestamp ? { timestamp: true } : undefined);
  };
  return createHostProgress({
    writer: {
      line: (text) => write(text, false),
      timestampedLine: (text) => write(text, true),
      live: stderr,
    },
    setting,
    project: options.generator.projectId,
    warn: (message) => options.logger()?.warn(message),
    ...(options.generator.session?.onProgress
      ? { forward: options.generator.session.onProgress }
      : {}),
  });
}

/** The generator options with `progress` as the session's progress consumer. */
export function withProgress(
  generator: GeneratorBootstrapOptions,
  progress: HostProgress | undefined,
): GeneratorBootstrapOptions {
  if (!progress) return generator;
  return { ...generator, session: { ...generator.session, onProgress: progress.sink } };
}
