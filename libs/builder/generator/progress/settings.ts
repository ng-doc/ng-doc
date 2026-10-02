/**
 * Progress settings. Precedence: CLI flag > `NGDOC_PROGRESS` > builder or plugin
 * option > host quiet settings > `auto`.
 */
export type ProgressSetting = 'auto' | 'live' | 'plain' | 'summary' | 'off' | 'json' | 'verbose';

/** Builder and plugin options take every setting except `json`, which is for tools. */
export type ProgressOptionSetting = Exclude<ProgressSetting, 'json'>;

export const PROGRESS_SETTINGS: readonly ProgressSetting[] = Object.freeze([
  'auto',
  'live',
  'plain',
  'summary',
  'off',
  'json',
  'verbose',
]);

export const PROGRESS_ENV = 'NGDOC_PROGRESS';
/** Opt-in GitHub/GitLab collapsible groups and the GitHub step summary. */
export const PROGRESS_SECTIONS_ENV = 'NGDOC_PROGRESS_SECTIONS';
/** Node warning code for an unknown `NGDOC_PROGRESS` value (once per process). */
export const NGDOC_PROGRESS_VALUE = 'NGDOC_PROGRESS_VALUE';

export type ProgressSettingSource = 'cli' | 'env' | 'option' | 'host' | 'default';

export interface ResolvedProgressSetting {
  setting: ProgressSetting;
  source: ProgressSettingSource;
}

/** What the host says about its own quietness. */
export interface HostQuiet {
  /** Vite `logLevel`: `warn`, `error` and `silent` turn progress off. */
  viteLogLevel?: 'info' | 'warn' | 'error' | 'silent';
  /** Angular application option `progress`: `false` keeps the summary only. */
  angularProgress?: boolean;
}

export interface ResolveProgressOptions {
  /** `--progress <value>`, already validated by the CLI (`isProgressSetting`). */
  cli?: ProgressSetting;
  env?: NodeJS.ProcessEnv;
  /** `ngDoc.progress` (Angular builders) or the Vite plugin option `progress` (Vite dev server and build). */
  option?: ProgressOptionSetting;
  host?: HostQuiet;
  /** Defaults to `process.emitWarning`. */
  warn?: (message: string, code: string) => void;
}

export const isProgressSetting = (value: unknown): value is ProgressSetting =>
  typeof value === 'string' && (PROGRESS_SETTINGS as readonly string[]).includes(value);

/** Normalises a user-typed value (`' Plain '` → `plain`); `undefined` when it is not a setting. */
export function parseProgressSetting(value: string | undefined): ProgressSetting | undefined {
  const normalized = value?.trim().toLowerCase();
  return isProgressSetting(normalized) ? normalized : undefined;
}

const reported = new Set<string>();

/** Test hook: forget which unknown values were already reported in this process. */
export function resetProgressWarnings(): void {
  reported.clear();
}

const emitWarning = (message: string, code: string): void => {
  process.emitWarning(message, { code });
};

/**
 * Resolves the effective setting. An unknown `NGDOC_PROGRESS` warns once and counts as unset. The
 * first explicit setting wins, except that an explicit `auto` ("decide for me") still yields to
 * the host's quiet settings.
 */
export function resolveProgressSetting(
  options: ResolveProgressOptions = {},
): ResolvedProgressSetting {
  const explicit = explicitSetting(options);
  if (explicit && explicit.setting !== 'auto') return explicit;
  const level = options.host?.viteLogLevel;
  if (level === 'warn' || level === 'error' || level === 'silent')
    return { setting: 'off', source: 'host' };
  if (options.host?.angularProgress === false) return { setting: 'summary', source: 'host' };
  return explicit ?? { setting: 'auto', source: 'default' };
}

function explicitSetting(options: ResolveProgressOptions): ResolvedProgressSetting | undefined {
  if (options.cli) return { setting: options.cli, source: 'cli' };
  const raw = (options.env ?? process.env)[PROGRESS_ENV];
  if (raw !== undefined && raw.trim() !== '') {
    const parsed = parseProgressSetting(raw);
    if (parsed) return { setting: parsed, source: 'env' };
    if (!reported.has(PROGRESS_ENV)) {
      reported.add(PROGRESS_ENV);
      (options.warn ?? emitWarning)(
        `Unrecognised ${PROGRESS_ENV}=${JSON.stringify(raw)}; use one of ${PROGRESS_SETTINGS.join(', ')}. Using auto.`,
        NGDOC_PROGRESS_VALUE,
      );
    }
  }
  if (options.option && options.option !== ('json' as string) && isProgressSetting(options.option))
    return { setting: options.option, source: 'option' };
  return undefined;
}

/** `NGDOC_PROGRESS_SECTIONS`: `1`/`true`/`on`/`yes` turn the CI sections on. */
export function sectionsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return /^(1|true|on|yes)$/i.test(env[PROGRESS_SECTIONS_ENV]?.trim() ?? '');
}

/**
 * Engine switches that change how fast NgDoc works. When one is set to a non-default value, the
 * reporter prints one notice, so a slow edit explains itself.
 */
export const ENGINE_SWITCHES: ReadonlyArray<{ name: string; values: RegExp; effect: string }> =
  Object.freeze([
    {
      name: 'NGDOC_PERSISTENT_WORKER',
      values: /^(0|false|off|no)$/i,
      effect: 'a new worker for every generation',
    },
    {
      name: 'NGDOC_PERSISTENT_WORKER_PRIME',
      values: /^(0|false|off|no)$/i,
      effect: 'the first build runs in a separate worker and there is no warm-up',
    },
    {
      name: 'NGDOC_DELTA_TRANSPORT',
      values: /^(0|false|off|no|verify)$/i,
      effect: 'full result transfer',
    },
    {
      name: 'NGDOC_TARGETED_REBUILD',
      values: /^(0|false|off|no|verify)$/i,
      effect: 'edits rebuild all pages',
    },
    {
      name: 'NGDOC_INCREMENTAL_SKIP',
      values: /^(0|false|off|no)$/i,
      effect: 'TypeScript is analyzed from scratch',
    },
    {
      name: 'NGDOC_SEMANTIC_RECORDER',
      values: /^(0|false|off|no|verify)$/i,
      effect: 'dependency recording changed',
    },
    {
      name: 'NGDOC_SCOPED_SEMANTIC',
      values: /^(0|false|off|no|verify)$/i,
      effect: 'API edits rebuild every API page',
    },
    {
      name: 'NGDOC_INCREMENTAL_PROGRAM',
      values: /^(0|false|off|no|verify)$/i,
      effect: 'TypeScript edits re-analyze the whole program',
    },
    {
      name: 'NGDOC_TRACKED_PROGRAM_REUSE',
      values: /^(0|false|off|no)$/i,
      effect: 'every API embed tracks the whole program again',
    },
    {
      name: 'NGDOC_FAST_START',
      values: /^(0|false|off|no|verify)$/i,
      effect: 'every start compiles all pages',
    },
    {
      name: 'NGDOC_SHAPE_CLOSURE',
      values: /^(0|false|off|no|verify)$/i,
      effect: 'body edits rebuild every page that imports the file',
    },
    {
      name: 'NGDOC_ANGULAR_SHARED_PASS',
      values: /^(0|false|off|no)$/i,
      effect: 'one Angular pass per generated module',
    },
    {
      name: 'NGDOC_ANGULAR_STRUCTURAL_PASS',
      values: /^(0|false|off|no)$/i,
      effect: 'adding or removing a page compiles the application twice',
    },
    {
      name: 'NGDOC_VITE_BUILD_HANDOFF',
      values: /^(0|false|off|no)$/i,
      effect: 'the server build generates again',
    },
    {
      name: 'NGDOC_PARALLEL_WRITES',
      values: /^(0|false|off|no)$/i,
      effect: 'generated files are written one at a time',
    },
  ]);

/**
 * The engine switches set in `env`, in declaration order, each as `NAME=value (effect)`. `verify`
 * values add checks rather than turning something off.
 */
export function activeEngineSwitches(env: NodeJS.ProcessEnv = process.env): string[] {
  return ENGINE_SWITCHES.flatMap(({ name, values, effect }) => {
    const value = env[name]?.trim();
    if (!value || !values.test(value)) return [];
    return [`${name}=${value} (${/^verify$/i.test(value) ? 'extra verification' : effect})`];
  });
}
