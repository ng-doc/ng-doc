import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type {
  BuildSession,
  DiscoveryRequest,
  JsonValue,
  PublishedGeneratorConfiguration,
} from '../contracts';
import type { DiscoveryOptions } from '../discovery';
import {
  type FlagValue,
  DELTA_TRANSPORT_FLAG,
  PARALLEL_WRITES_FLAG,
  PERSISTENT_WORKER_FLAG,
  PERSISTENT_WORKER_PRIME_FLAG,
  readFlag,
  TARGETED_REBUILD_FLAG,
} from '../kernel/flags';
import { type SessionOptions, createBuildSession } from '../session/build-session';
import { type PersistentWorkerOptions, createWorkerCompilationService } from '../worker';
import { createCandidateOutputCommitter } from './candidate-output-committer';
import { GENERATOR_COMPILER_VERSION, GENERATOR_TOOLCHAIN_DIGEST } from './constants';

export type {
  CandidateOutputCommitterHostOptions,
  CandidateOutputCommitterOptions,
} from './candidate-output-committer';
export { createCandidateOutputCommitter } from './candidate-output-committer';
export { GENERATOR_COMPILER_VERSION, GENERATOR_TOOLCHAIN_DIGEST } from './constants';

export interface GeneratorBootstrapOptions {
  projectId: string;
  workspaceRoot: string;
  configFile?: string;
  defaults: DiscoveryRequest['defaults'];
  discovery?: DiscoveryOptions;
  templateRoot?: string;
  compilerVersion?: string;
  toolchainDigest?: string;
  /**
   * Development content is always committed as physical files, so `'file'` is the only accepted
   * value and the option can be omitted. The former virtual content mode (`'virtual'`) was removed
   * and is rejected with `NGDOC_DEVELOPMENT_CONTENT_REMOVED`.
   */
  developmentContent?: 'file';
  worker?: {
    moduleUrl?: string | URL;
    workerEntryUrl?: URL;
    startupTimeoutMs?: number;
    compileTimeoutMs?: number;
    maxPendingRequests?: number;
    /**
     * Development watch generations share one long-lived compiler worker per watch session;
     * production and a development buildOnce during or after a watch fork a fresh one-shot worker
     * (a development buildOnce before the first watch runs in the long-lived one while priming is
     * on, see below). `false`, or the environment variable `NGDOC_PERSISTENT_WORKER=0` (also
     * `false`, `off`, `no`), forces a fresh worker for every development generation too. Defaults
     * to enabled with the `PersistentWorkerOptions` defaults (1.5 s abort grace, recycle after 50
     * generations or above 3 GiB resident).
     *
     * Priming (`PersistentWorkerOptions.prime`, default on): the development buildOnce before the
     * first watch runs in the long-lived worker, and when the watch reuses it as its verified
     * baseline, the session asks that worker to warm up while idle, so the first edit already finds
     * a retained TypeScript program. A worker that compiled the baseline returns at once; otherwise
     * it compiles the baseline once more (about one generation of CPU; a real change supersedes
     * it).
     * It never runs without the persistent worker, so the kill switch above also turns it off.
     * `persistent: { prime: false }`, or `NGDOC_PERSISTENT_WORKER_PRIME=0` (also `false`, `off`,
     * `no`), turns off only the priming.
     *
     * Delta transport (`PersistentWorkerOptions.delta`, default on): the long-lived worker keeps
     * the committed snapshot, so a watch generation sends only its changes and base revision and
     * receives only the changed artifacts, which the session applies to its snapshot without full
     * copies; the worker promotes a candidate to its base only after the session committed it. Any
     * disagreement falls back to a resync with the full snapshot. It needs the persistent worker.
     * `persistent: { delta: false }`, or `NGDOC_DELTA_TRANSPORT=0` (also `false`, `off`, `no`),
     * keeps the full transport; `NGDOC_DELTA_TRANSPORT=verify` checks every delta against the full
     * candidate (diagnosis only).
     */
    persistent?: boolean | PersistentWorkerOptions;
  };
  session?: SessionOptions;
}

/** Environment kill switch for the persistent development worker (see `worker.persistent`). */
export const PERSISTENT_WORKER_ENV = PERSISTENT_WORKER_FLAG;
/** Environment opt-out of priming the persistent development worker (see `worker.persistent`). */
export const PERSISTENT_WORKER_PRIME_ENV = PERSISTENT_WORKER_PRIME_FLAG;
/** Environment kill switch (and `verify` mode) of the delta transport (see `worker.persistent`). */
export const DELTA_TRANSPORT_ENV = DELTA_TRANSPORT_FLAG;
/**
 * Environment kill switch of the targeted rebuild: `0`/`false`/`off`/`no` turn it off;
 * `1`/`true`/`on`/`yes`, `verify` and unset leave it on; any other value is reported once
 * (`NGDOC_TARGETED_REBUILD_VALUE`) and leaves it on.
 *
 * - On: a development watch generation whose changes are all content edits compiles only the
 *   units they reach (the compiler's `targetedRebuild` option, passed as a factory option), and
 *   only such a generation's commit is a delta commit. Every other commit is the full commit.
 * - Off: every generation is the full generation and every commit the full commit
 *   (`targetedRebuild: false`, `OutputCommitterOptions.delta: false`).
 * - `verify`: as on, and every targeted generation is also compiled in full; the two results are
 *   compared byte for byte (`targetedRebuild: 'verify'`). On a difference the full result is
 *   published and the difference is reported as a `COMPILATION_TARGETED_MISMATCH` process warning
 *   (`WorkerCompilationService.targetedDryRun()` counts them), since the worker's output is not
 *   forwarded: it returns each generation's record with its reply.
 *   `NGDOC_TARGETED_REBUILD_TRACE=<file>` also appends every record to that file.
 *
 * The targeted rebuild needs a retained program, so it runs only in the long-lived development
 * worker: with `NGDOC_PERSISTENT_WORKER=0` every generation is one-shot and full.
 */
export const TARGETED_REBUILD_ENV = TARGETED_REBUILD_FLAG;
/**
 * Environment kill switch of parallel output writes: `0`/`false`/`off`/`no` turn them off;
 * `1`/`true`/`on`/`yes` and unset leave them on; any other value is reported once
 * (`NGDOC_PARALLEL_WRITES_VALUE`) and leaves them on.
 *
 * - On: a commit stages its changed outputs and takes the backup copies of the outputs it
 *   replaces concurrently, then publishes them one rename at a time in the sequential order, the
 *   manifest last (`OutputCommitterOptions.parallelWrites`).
 * - Off: every staging write, backup and publication runs one output at a time, as before
 *   (`parallelWrites: false`). The published files and manifest are the same either way.
 */
export const PARALLEL_WRITES_ENV = PARALLEL_WRITES_FLAG;

const unrecognisedSwitchReported = new Set<string>();

/**
 * The registered environment switch `name` (`kernel/flags.ts`): `0`/`false`/`off`/`no` turn it
 * off; `1`/`true`/`on`/`yes` and an empty value leave the option in charge, and so does `verify`
 * where the switch accepts it. Any other value is reported once per process and switch (as a Node
 * warning) and also leaves the option in charge.
 */
function switchValue(
  name: string,
  what: string,
  code: string = 'NGDOC_PERSISTENT_WORKER_VALUE',
): FlagValue {
  const { value, unrecognised } = readFlag(name);
  if (unrecognised !== undefined && !unrecognisedSwitchReported.has(name)) {
    unrecognisedSwitchReported.add(name);
    process.emitWarning(
      `Unrecognised ${name}=${JSON.stringify(unrecognised)}; use 0, false, off or no to disable ${what}.`,
      { code },
    );
  }
  return value;
}

function persistentWorker(
  option: boolean | PersistentWorkerOptions | undefined,
): boolean | PersistentWorkerOptions {
  if (switchValue(PERSISTENT_WORKER_ENV, 'the persistent development worker') === 'off')
    return false;
  const persistent = option ?? true;
  if (persistent === false) return false;
  const options: PersistentWorkerOptions = persistent === true ? {} : { ...persistent };
  if (
    switchValue(PERSISTENT_WORKER_PRIME_ENV, 'priming the persistent development worker') === 'off'
  )
    options.prime = false;
  const delta = switchValue(DELTA_TRANSPORT_ENV, 'the delta transport');
  if (delta === 'off') options.delta = false;
  else if (delta === 'verify') options.delta = 'verify';
  return persistent === true && !Object.keys(options).length ? true : options;
}

/** In-process policy hooks. These values are intentionally excluded from worker options. */
export interface GeneratorHostOptions {
  admitConfiguration?: (configuration: Readonly<PublishedGeneratorConfiguration>) => void;
}

function absolute(name: string, value: string): string {
  if (!value || value.includes('\0')) throw new TypeError(`${name} must be a non-empty path.`);
  const normalized = path.resolve(value).replace(/\\/g, '/');
  if (!path.isAbsolute(value)) throw new TypeError(`${name} must be absolute.`);
  return normalized;
}

function text(name: string, value: string): string {
  if (!value.trim() || value.includes('\0')) throw new TypeError(`${name} must be non-empty.`);
  return value;
}

/**
 * Rejects every `developmentContent` value except `'file'` or none. The removed virtual content
 * mode gets the coded `NGDOC_DEVELOPMENT_CONTENT_REMOVED` migration error. Hosts call it while
 * they resolve their options, so the error is reported before any generator work starts.
 */
export function assertDevelopmentContent(value: unknown): void {
  if (value === undefined || value === 'file') return;
  if (value === 'virtual') {
    throw new TypeError(
      "[NGDOC_DEVELOPMENT_CONTENT_REMOVED] developmentContent: 'virtual' (the virtual content " +
        'mode) was removed. Remove the option: generated content is always written as physical ' +
        'files, which the Vite plugin serves and reloads.',
    );
  }
  throw new TypeError("developmentContent must be 'file' or omitted.");
}

/** Composes the existing worker, BuildSession, and transactional publication authority. */
export function createGeneratorBuildSession(
  options: GeneratorBootstrapOptions,
  host: GeneratorHostOptions = {},
): BuildSession {
  assertDevelopmentContent(options.developmentContent);
  const projectId = text('projectId', options.projectId);
  const workspaceRoot = absolute('workspaceRoot', options.workspaceRoot);
  const defaults = {
    docsRoot: absolute('defaults.docsRoot', options.defaults.docsRoot),
    tsConfig: absolute('defaults.tsConfig', options.defaults.tsConfig),
    outputRoot: absolute('defaults.outputRoot', options.defaults.outputRoot),
    cacheRoot: absolute('defaults.cacheRoot', options.defaults.cacheRoot),
  };
  const configFile = options.configFile ? absolute('configFile', options.configFile) : undefined;
  const templateRoot = absolute(
    'templateRoot',
    options.templateRoot ?? fileURLToPath(new URL('../templates/', import.meta.url)),
  );
  const compilerVersion = text(
    'compilerVersion',
    options.compilerVersion ?? GENERATOR_COMPILER_VERSION,
  );
  const toolchainDigest = text(
    'toolchainDigest',
    options.toolchainDigest ?? GENERATOR_TOOLCHAIN_DIGEST,
  );
  const { moduleUrl, workerEntryUrl, persistent, ...limits } = options.worker ?? {};
  const targetedSwitch = switchValue(
    TARGETED_REBUILD_ENV,
    'the targeted rebuild',
    'NGDOC_TARGETED_REBUILD_VALUE',
  );
  const targeted: boolean | 'verify' =
    targetedSwitch === 'off' ? false : targetedSwitch === 'verify' ? 'verify' : true;
  const parallelWrites =
    switchValue(PARALLEL_WRITES_ENV, 'parallel output writes', 'NGDOC_PARALLEL_WRITES_VALUE') !==
    'off';
  const factoryOptions = {
    projectId,
    workspaceRoot,
    ...(configFile ? { configFile } : {}),
    defaults,
    ...(options.discovery ? { discovery: structuredClone(options.discovery) } : {}),
    templateRoot,
    compilerVersion,
    toolchainDigest,
    ...(targeted === 'verify' ? { targetedRebuild: 'verify' } : {}),
    ...(targeted === false ? { targetedRebuild: false } : {}),
  } as unknown as JsonValue;
  const compiler = createWorkerCompilationService({
    moduleUrl: moduleUrl ?? new URL('../compiler/index.js', import.meta.url),
    workerEntryUrl: workerEntryUrl ?? new URL('../worker/entry.js', import.meta.url),
    factoryOptions,
    ...limits,
    persistent: persistentWorker(persistent),
  });
  return createBuildSession(
    {
      compiler,
      committer: createCandidateOutputCommitter(
        {
          ...(targeted === false ? { delta: false } : {}),
          ...(parallelWrites ? {} : { parallelWrites: false }),
        },
        host,
      ),
    },
    options.session,
  );
}
