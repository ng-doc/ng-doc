/**
 * The engine's environment switches, registered and parsed in one place, so a switch means the
 * same in the host and in the compiler runtime (which sees the host's environment through the
 * worker).
 *
 * Every switch is on by default. `0`, `false`, `off` or `no` (case-insensitive, trimmed) turn it
 * off; `1`, `true`, `on`, `yes` and an empty value leave it on; switches that accept `verify` also
 * take `verify`, which keeps the optimization on and checks it against the reference path. Any
 * other value is unrecognised: it leaves the switch on, and {@link readFlag} returns it so the
 * reader that reports values (bootstrap) can warn once.
 */

/** A switch's parsed value. */
export type FlagValue = 'on' | 'off' | 'verify';

export interface FlagDefinition {
  readonly name: string;
  readonly description: string;
  readonly default: 'on';
  /** Whether `verify` is a recognised value. */
  readonly verify: boolean;
}

export const PERSISTENT_WORKER_FLAG = 'NGDOC_PERSISTENT_WORKER';
export const PERSISTENT_WORKER_PRIME_FLAG = 'NGDOC_PERSISTENT_WORKER_PRIME';
export const DELTA_TRANSPORT_FLAG = 'NGDOC_DELTA_TRANSPORT';
export const TARGETED_REBUILD_FLAG = 'NGDOC_TARGETED_REBUILD';
export const INCREMENTAL_SKIP_FLAG = 'NGDOC_INCREMENTAL_SKIP';
export const SEMANTIC_RECORDER_FLAG = 'NGDOC_SEMANTIC_RECORDER';
export const SCOPED_SEMANTIC_FLAG = 'NGDOC_SCOPED_SEMANTIC';
export const INCREMENTAL_PROGRAM_FLAG = 'NGDOC_INCREMENTAL_PROGRAM';
export const SHAPE_CLOSURE_FLAG = 'NGDOC_SHAPE_CLOSURE';
export const ANGULAR_SHARED_PASS_FLAG = 'NGDOC_ANGULAR_SHARED_PASS';
export const ANGULAR_STRUCTURAL_PASS_FLAG = 'NGDOC_ANGULAR_STRUCTURAL_PASS';
export const VITE_BUILD_HANDOFF_FLAG = 'NGDOC_VITE_BUILD_HANDOFF';
export const TRACKED_PROGRAM_REUSE_FLAG = 'NGDOC_TRACKED_PROGRAM_REUSE';
export const FAST_START_FLAG = 'NGDOC_FAST_START';
export const PARALLEL_WRITES_FLAG = 'NGDOC_PARALLEL_WRITES';
export const HIGHLIGHT_CACHE_FLAG = 'NGDOC_HIGHLIGHT_CACHE';
export const PARALLEL_RENDER_FLAG = 'NGDOC_PARALLEL_RENDER';

/** The registry, in the order the engine applies the switches. */
export const FLAGS: readonly FlagDefinition[] = Object.freeze(
  [
    {
      name: PERSISTENT_WORKER_FLAG,
      description: 'One long-lived compiler worker per development session.',
      verify: false,
    },
    {
      name: PERSISTENT_WORKER_PRIME_FLAG,
      description:
        'The development buildOnce before the first watch runs in the persistent worker, and an ' +
        'idle warm-up keeps that worker ready for the first edit.',
      verify: false,
    },
    {
      name: DELTA_TRANSPORT_FLAG,
      description: 'Snapshot deltas between the persistent worker and the session.',
      verify: true,
    },
    {
      name: TARGETED_REBUILD_FLAG,
      description: 'Development edits compile only the units they reach, and commit as a delta.',
      verify: true,
    },
    {
      name: INCREMENTAL_SKIP_FLAG,
      description: 'A development generation reuses the retained TypeScript program.',
      verify: false,
    },
    {
      name: SEMANTIC_RECORDER_FLAG,
      description: 'Semantic queries record the nodes and files they read.',
      verify: true,
    },
    {
      name: SCOPED_SEMANTIC_FLAG,
      description:
        'Units record their semantic closure instead of the global semantic reference, so an ' +
        'API edit re-renders only the content whose closure changed.',
      verify: true,
    },
    {
      name: INCREMENTAL_PROGRAM_FLAG,
      description:
        'A development generation patches the content edits of program files into the retained ' +
        'TypeScript program instead of synchronizing a new one.',
      verify: true,
    },
    {
      name: TRACKED_PROGRAM_REUSE_FLAG,
      description:
        'The semantic queries of one generation that depend on the whole program (the API ' +
        'embeds of guides, outside scoped development generations) share one tracking of it.',
      verify: false,
    },
    {
      name: FAST_START_FLAG,
      description:
        'A development start whose recorded inputs all re-read identically publishes the cached ' +
        'candidate without compiling, and a start after edits reuses the cached links and ' +
        'assemblies of unchanged pages.',
      verify: true,
    },
    {
      name: SHAPE_CLOSURE_FLAG,
      description:
        'A semantic closure follows the files its query depends on by their declaration shapes, ' +
        'so a body edit that keeps the types re-renders only the content that read the file.',
      verify: true,
    },
    {
      name: ANGULAR_SHARED_PASS_FLAG,
      description:
        'In the Vite host, the TypeScript outputs one generation updated share one Angular ' +
        'compiler pass instead of one full pass per file.',
      verify: false,
    },
    {
      name: ANGULAR_STRUCTURAL_PASS_FLAG,
      description:
        'In the Vite host, the generated modules and description modules a generation creates ' +
        "or deletes join that generation's Angular compiler pass instead of starting a pass of " +
        'their own.',
      verify: false,
    },
    {
      name: VITE_BUILD_HANDOFF_FLAG,
      description:
        "The server build of the Vite production pipeline publishes the browser build's " +
        'generation instead of generating again.',
      verify: false,
    },
    {
      name: HIGHLIGHT_CACHE_FLAG,
      description:
        'Code blocks are highlighted with one Shiki highlighter per runtime and cached by their ' +
        'text, language, meta, themes and Shiki version; development keeps the cache beside the ' +
        'artifact cache.',
      verify: true,
    },
    {
      name: PARALLEL_RENDER_FLAG,
      description:
        'A large generation runs the HTML processing of its pages (highlighting, anchors, keyword ' +
        'links, search records) on up to four worker threads, while the main thread prepares the ' +
        'next pages in order.',
      verify: true,
    },
    {
      name: PARALLEL_WRITES_FLAG,
      description:
        'An output commit stages its changed files and takes its backup copies concurrently, ' +
        'and still publishes them one rename at a time, the manifest last.',
      verify: false,
    },
  ].map((flag) => Object.freeze({ ...flag, default: 'on' as const })),
);

const OFF = /^(0|false|off|no)$/i;
const ON = /^(1|true|on|yes)$/i;
const VERIFY = /^verify$/i;

function definition(name: string): FlagDefinition {
  const found = FLAGS.find((flag) => flag.name === name);
  if (!found) throw new Error(`Unregistered engine switch ${name}`);
  return found;
}

/**
 * The value of the registered switch `name` in `env`. `unrecognised` is the trimmed raw value when
 * it is not one the switch accepts; the value is then the default.
 */
export function readFlag(
  name: string,
  env: Readonly<Record<string, string | undefined>> = process.env,
): { value: FlagValue; unrecognised?: string } {
  const flag = definition(name);
  const raw = env[name]?.trim();
  if (!raw || ON.test(raw)) return { value: flag.default };
  if (OFF.test(raw)) return { value: 'off' };
  if (flag.verify && VERIFY.test(raw)) return { value: 'verify' };
  return { value: flag.default, unrecognised: raw };
}

/** Whether the registered switch `name` is turned off in `env`. */
export function flagOff(
  name: string,
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return readFlag(name, env).value === 'off';
}
