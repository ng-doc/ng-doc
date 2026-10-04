import { type ChildProcess, spawn } from 'node:child_process';
import path from 'node:path';

import type {
  BuildEvent,
  BuildResult,
  BuildSession,
  FileEventSource,
  PublishedGeneratorConfiguration,
  WatchHandle,
} from '../contracts';
import type { ProgressStream } from '../progress/detect';
import { type HostProgress, createHostProgress } from '../progress/host';
import type { LiveStream } from '../progress/live';
import {
  type ProgressSetting,
  parseProgressSetting,
  PROGRESS_SETTINGS,
  resolveProgressSetting,
} from '../progress/settings';
import { createParcelEventSource } from '../session/parcel-event-source';
import { GENERATOR_COMPILER_VERSION } from './constants';
import { type GeneratorBootstrapOptions, createGeneratorBuildSession } from './index';
import { killWindowsProcessTree, windowsSpawnPlan } from './process-tree';

export interface GeneratorCliIO {
  cwd(): string;
  stdout(text: string): void;
  stderr(text: string): void;
  /** Progress settings and terminal detection read it; `process.env` when omitted. */
  env?: NodeJS.ProcessEnv;
  /** Where the live progress line is drawn (`process.stderr`); without it progress uses lines. */
  terminal?: LiveStream & ProgressStream;
}

/** @internal Injectable native ports; the public package entry exports only runGeneratorCli. */
export interface GeneratorCliRuntime {
  createSession(options: GeneratorBootstrapOptions): BuildSession;
  createEventSource(root: string, ignore: string[]): FileEventSource;
  spawnHost(command: string, args: string[], cwd: string): ChildProcess;
}

interface ParsedOptions {
  command: 'generate' | 'dev';
  projectId: string;
  workspaceRoot: string;
  configFile?: string;
  docsRoot: string;
  tsConfig: string;
  outputRoot: string;
  cacheRoot: string;
  tags: string[];
  json: boolean;
  progress?: ProgressSetting;
  host: string[];
}

interface CliSignalReason {
  exitCode?: number;
}

interface Termination {
  promise: Promise<number>;
  resolve(code: number): void;
}

const usage = `Usage:
  ng-doc generate --project <id> [options]
  ng-doc dev --project <id> [options] [-- <executable> ...args]
  ng-doc watch --project <id> [options]

Options:
  --workspace <path>    Workspace root (default: current directory)
  --config <path>       Explicit executable ng-doc configuration
  --docs-root <path>    Fallback documentation root
  --tsconfig <path>     Fallback TypeScript configuration
  --output-root <path>  Final fallback publication root
  --cache-root <path>   Artifact cache root
  --tags <a,b,...>      Build tags for onlyForTags (default: production for generate,
                        development for dev and watch)
  --json                Write JSON event lines
  --progress <mode>     auto, live, plain, verbose, summary, json or off (default: auto, or
                        NGDOC_PROGRESS). Progress goes to stderr and the result line to stdout;
                        with --json only json adds progress events to the JSON lines
`;

const defaultIo: GeneratorCliIO = {
  cwd: () => process.cwd(),
  stdout: (value) => process.stdout.write(value),
  stderr: (value) => process.stderr.write(value),
  env: process.env,
  terminal: process.stderr,
};

const defaultRuntime: GeneratorCliRuntime = {
  createSession: createGeneratorBuildSession,
  createEventSource: (root, ignore) => createParcelEventSource(root, { ignore }),
  spawnHost: spawnOwnedHost,
};

const ownedProcessGroups = new WeakMap<ChildProcess, number>();
/** Windows hosts: the tree's root and how to end the tree. */
const ownedProcessTrees = new WeakMap<
  ChildProcess,
  { readonly pid: number; readonly kill: (pid: number) => Promise<void> }
>();

/** @internal Test ports of {@link spawnOwnedHost}. */
export interface OwnedHostPorts {
  readonly platform?: NodeJS.Platform;
  readonly env?: NodeJS.ProcessEnv;
  /** Ends a Windows process tree; `taskkill /T /F` by default. */
  readonly killTree?: (pid: number) => Promise<void>;
}

/**
 * @internal Starts the host command without a shell. On POSIX it leads its own process group,
 * which the CLI joins completely. Windows has no process groups: the host is started in the CLI's
 * console (so Ctrl+C reaches both), a `.cmd`/`.bat` command such as `ng` or `npx` through
 * `cmd.exe` with quoted arguments, and it is stopped by ending its process tree.
 */
export function spawnOwnedHost(
  command: string,
  args: string[],
  cwd: string,
  ports: OwnedHostPorts = {},
): ChildProcess {
  if ((ports.platform ?? process.platform) === 'win32') {
    const plan = windowsSpawnPlan(command, args, { cwd, env: ports.env ?? process.env });
    const child = spawn(plan.file, [...plan.args], {
      cwd,
      shell: false,
      stdio: 'inherit',
      windowsVerbatimArguments: plan.verbatim,
    });
    if (child.pid !== undefined) {
      ownedProcessTrees.set(child, {
        pid: child.pid,
        kill: ports.killTree ?? ((pid) => killWindowsProcessTree(pid)),
      });
    }
    return child;
  }
  const child = spawn(command, args, { cwd, detached: true, shell: false, stdio: 'inherit' });
  if (child.pid !== undefined) ownedProcessGroups.set(child, child.pid);
  return child;
}

function termination(): Termination {
  let resolve!: (code: number) => void;
  const promise = new Promise<number>((settled) => {
    resolve = settled;
  });
  let done = false;
  return {
    promise,
    resolve(code: number) {
      if (done) return;
      done = true;
      resolve(code);
    },
  };
}

function signalExitCode(signal: AbortSignal): number {
  const reason = signal.reason as CliSignalReason | undefined;
  return reason?.exitCode === 143 ? 143 : 130;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizePath(workspaceRoot: string, value: string): string {
  if (value.includes('\0')) throw new Error('Paths cannot contain NUL characters.');
  return path.resolve(workspaceRoot, value).replace(/\\/g, '/');
}

function parse(argv: readonly string[], io: GeneratorCliIO): ParsedOptions | number {
  if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h') {
    io.stdout(usage);
    return 0;
  }
  if (argv[0] === '--version') {
    io.stdout(`${GENERATOR_COMPILER_VERSION}\n`);
    return 0;
  }
  const rawCommand = argv[0];
  if (rawCommand !== 'generate' && rawCommand !== 'dev' && rawCommand !== 'watch') {
    io.stderr(`Unknown command: ${rawCommand ?? ''}\n${usage}`);
    return 2;
  }
  const separator = argv.indexOf('--');
  const optionTokens = argv.slice(1, separator < 0 ? undefined : separator);
  const host = separator < 0 ? [] : [...argv.slice(separator + 1)];
  if (rawCommand === 'generate' && separator >= 0) {
    io.stderr('The generate command does not accept a host executable.\n');
    return 2;
  }
  if (separator >= 0 && host.length === 0) {
    io.stderr('Expected an executable after --.\n');
    return 2;
  }

  const flags = new Map<string, string | true>();
  const valueFlags = new Set([
    '--project',
    '--workspace',
    '--config',
    '--docs-root',
    '--tsconfig',
    '--output-root',
    '--cache-root',
    '--tags',
    '--progress',
  ]);
  for (let index = 0; index < optionTokens.length; index += 1) {
    // `--progress=json` as well as `--progress json`.
    const inline = optionTokens[index].startsWith('--progress=')
      ? optionTokens[index].slice('--progress='.length)
      : undefined;
    const token = inline === undefined ? optionTokens[index] : '--progress';
    if (flags.has(token)) {
      io.stderr(`Duplicate option: ${token}\n`);
      return 2;
    }
    if (token === '--json') {
      flags.set(token, true);
      continue;
    }
    if (!valueFlags.has(token)) {
      io.stderr(`Unknown option: ${token}\n`);
      return 2;
    }
    const value = inline ?? optionTokens[++index];
    if (value === undefined || (inline !== undefined && !value) || value.startsWith('--')) {
      io.stderr(`Missing value for ${token}.\n`);
      return 2;
    }
    flags.set(token, value);
  }

  const projectId = flags.get('--project');
  if (typeof projectId !== 'string' || !projectId.trim() || projectId.includes('\0')) {
    io.stderr('A non-empty --project value is required.\n');
    return 2;
  }
  const cwd = normalizePath(io.cwd(), '.');
  const workspaceFlag = flags.get('--workspace');
  const workspaceRoot = normalizePath(cwd, typeof workspaceFlag === 'string' ? workspaceFlag : cwd);
  const pathFlag = (name: string, fallback: string): string => {
    const value = flags.get(name);
    return normalizePath(workspaceRoot, typeof value === 'string' ? value : fallback);
  };
  const config = flags.get('--config');
  const tagsFlag = flags.get('--tags');
  const tags =
    typeof tagsFlag === 'string'
      ? tagsFlag.split(',').map((tag) => tag.trim())
      : [rawCommand === 'generate' ? 'production' : 'development'];
  if (tags.some((tag) => !tag || tag.includes('\0'))) {
    io.stderr('--tags must be a comma-separated list of non-empty tags.\n');
    return 2;
  }
  const progressFlag = flags.get('--progress');
  const progress =
    typeof progressFlag === 'string' ? parseProgressSetting(progressFlag) : undefined;
  if (typeof progressFlag === 'string' && !progress) {
    io.stderr(`--progress must be one of ${PROGRESS_SETTINGS.join(', ')}.\n`);
    return 2;
  }
  return {
    command: rawCommand === 'generate' ? 'generate' : 'dev',
    projectId,
    workspaceRoot,
    ...(typeof config === 'string' ? { configFile: normalizePath(workspaceRoot, config) } : {}),
    docsRoot: pathFlag('--docs-root', 'docs'),
    tsConfig: pathFlag('--tsconfig', 'tsconfig.json'),
    outputRoot: pathFlag('--output-root', `.ng-doc/${projectId}`),
    cacheRoot: pathFlag('--cache-root', `.cache/ng-doc/${projectId}`),
    tags,
    json: flags.get('--json') === true,
    ...(progress ? { progress } : {}),
    host,
  };
}

/** Diagnostics that only say a generation was stopped (the worker's abort, a disposed service). */
const CANCELLATION_CODES: ReadonlySet<string> = new Set([
  'WORKER_ABORTED',
  'WORKER_DISPOSED',
  'SESSION_DISPOSED',
]);

/**
 * Prints a result: its diagnostics, then its progress result line (the build summary or the
 * per-edit line), which follows the diagnostics it refers to. `verbose` also names the revision
 * and the output root. With progress off only diagnostics are printed. A generation that was
 * cancelled (Ctrl-C, or superseded by newer changes) does not report its own stop as an error:
 * its progress line says it was cancelled. `--json` keeps every diagnostic of the result.
 */
function resultOutput(
  result: BuildResult,
  json: boolean,
  io: GeneratorCliIO,
  progress: HostProgress | undefined,
  signal?: AbortSignal,
): void {
  if (json) {
    io.stdout(`${JSON.stringify({ kind: 'result', result })}\n`);
    progress?.release(result.generation);
    return;
  }
  const cancelled = result.status === 'cancelled' || signal?.aborted === true;
  for (const item of result.diagnostics) {
    if (cancelled && CANCELLATION_CODES.has(item.code)) continue;
    const target = item.severity === 'error' ? io.stderr : io.stdout;
    target(`[${item.severity}] ${item.code}: ${item.message}\n`);
  }
  progress?.release(result.generation);
  if (result.status === 'success' && progress?.reporter.environment.verbose) {
    io.stdout(
      `Generated ${result.snapshot.revision} at ${result.snapshot.configuration?.outputRoot ?? '<unknown>'}.\n`,
    );
  }
}

/** `io` whose writes first clear the live progress line, so the CLI's own lines never land behind it. */
function interrupting(io: GeneratorCliIO, progress: HostProgress | undefined): GeneratorCliIO {
  if (!progress) return io;
  return {
    ...io,
    stdout: (text) => {
      progress.interrupt();
      io.stdout(text);
    },
    stderr: (text) => {
      progress.interrupt();
      io.stderr(text);
    },
  };
}

/**
 * The CLI's progress, or none when it is off. `--json` keeps its line stream unchanged unless
 * progress events were asked for (`--progress json` or `NGDOC_PROGRESS=json`).
 */
function cliProgress(parsed: ParsedOptions, io: GeneratorCliIO): HostProgress | undefined {
  const env = io.env ?? process.env;
  const { setting } = resolveProgressSetting({
    ...(parsed.progress ? { cli: parsed.progress } : {}),
    env,
  });
  if (setting === 'off' || (parsed.json && setting !== 'json')) return undefined;
  return createHostProgress({
    writer: {
      line: (text) => io.stderr(`${text}\n`),
      summary: (text) => io.stdout(`${text}\n`),
      json: (text) => io.stdout(`${text}\n`),
      ...(io.terminal ? { live: io.terminal } : {}),
    },
    setting,
    env,
    project: parsed.projectId,
    warn: (message) => io.stderr(`${message}\n`),
  });
}

function diagnosticOutput(
  event: Extract<BuildEvent, { kind: 'diagnostic' }>,
  json: boolean,
  io: GeneratorCliIO,
): void {
  if (json) io.stdout(`${JSON.stringify(event)}\n`);
  else {
    const target = event.diagnostic.severity === 'error' ? io.stderr : io.stdout;
    target(
      `[${event.diagnostic.severity}] ${event.diagnostic.code}: ${event.diagnostic.message}\n`,
    );
  }
}

function hostExit(child: ChildProcess, io: GeneratorCliIO): Promise<number> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (code: number): void => {
      if (settled) return;
      settled = true;
      resolve(code);
    };
    child.once('error', (error) => {
      io.stderr(`Host failed: ${error.message}\n`);
      finish(1);
    });
    child.once('close', (code, signal) =>
      finish(
        code ??
          (signal === 'SIGINT' ? 130 : signal === 'SIGTERM' ? 143 : signal === 'SIGKILL' ? 137 : 1),
      ),
    );
    if (child.exitCode !== null) finish(child.exitCode);
  });
}

/** Whether `promise` settles within `timeoutMs`. */
async function settlesWithin(promise: Promise<unknown>, timeoutMs: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  try {
    return await Promise.race([promise.then(() => true), timedOut]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @internal Stops a host started by {@link spawnOwnedHost} (or another child) and waits for it:
 * `closed` settles when the child has closed.
 */
export async function stopHost(child: ChildProcess, closed: Promise<number>): Promise<void> {
  const tree = ownedProcessTrees.get(child);
  if (tree !== undefined) {
    // Windows delivers no catchable SIGTERM, so there is no graceful step to wait for: the tree
    // is ended while its root still links it. Ctrl+C in the console reached the host already.
    if (child.exitCode === null && child.signalCode === null) await tree.kill(tree.pid);
    if (!(await settlesWithin(closed, 5_000))) {
      throw new Error(`Host process tree ${tree.pid} did not stop.`);
    }
    return;
  }
  const group = ownedProcessGroups.get(child);
  if (group !== undefined) {
    if (processGroupAlive(group)) signalProcessGroup(group, 'SIGTERM');
    if (!(await waitForProcessGroup(group, 2_000))) {
      signalProcessGroup(group, 'SIGKILL');
      if (!(await waitForProcessGroup(group, 2_000))) {
        throw new Error(`Host process group ${group} did not stop.`);
      }
    }
    await closed;
    return;
  }
  if (child.exitCode !== null || child.signalCode !== null) {
    await closed;
    return;
  }
  child.kill('SIGTERM');
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(true), 2_000);
  });
  if (await Promise.race([closed.then(() => false), timedOut])) child.kill('SIGKILL');
  if (timer) clearTimeout(timer);
  await closed;
}

function processGroupAlive(group: number): boolean {
  try {
    process.kill(-group, 0);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ESRCH') return false;
    // macOS: every member exited, and one is not reaped yet. It counts as present, so a stop
    // waits (bounded) until it is reaped rather than failing on the probe.
    if (code === 'EPERM') return true;
    throw error;
  }
}

/**
 * Signals a process group. ESRCH: it is gone. EPERM: macOS answers it for a group whose members
 * have all exited but are not reaped yet, so nothing is left to signal.
 * @param group The process group id.
 * @param signal The signal.
 */
function signalProcessGroup(group: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-group, signal);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'ESRCH' && code !== 'EPERM') throw error;
  }
}

async function waitForProcessGroup(group: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (processGroupAlive(group)) {
    if (Date.now() >= deadline) return false;
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }
  return true;
}

/** @internal Creates a CLI around explicit native ports for deterministic lifecycle tests. */
export function createGeneratorCli(runtime: GeneratorCliRuntime) {
  return async function generatorCli(
    argv: readonly string[],
    io: GeneratorCliIO = defaultIo,
    signal: AbortSignal = new AbortController().signal,
  ): Promise<number> {
    let parsed: ParsedOptions | number;
    try {
      parsed = parse(argv, io);
    } catch (error) {
      io.stderr(`${errorMessage(error)}\n`);
      return 2;
    }
    if (typeof parsed === 'number') return parsed;

    let session: BuildSession | undefined;
    let watch: WatchHandle | undefined;
    let child: ChildProcess | undefined;
    let childClosed: Promise<number> | undefined;
    let cleanupPromise: Promise<void> | undefined;
    let watchUnusable = false;
    let progress: HostProgress | undefined;
    /** The CLI's own output: it clears the live progress line first. */
    let out = io;
    const end = termination();
    const cleanup = (): Promise<void> => {
      if (cleanupPromise) return cleanupPromise;
      cleanupPromise = Promise.allSettled([
        watch?.dispose(),
        session?.dispose(),
        child && childClosed ? stopHost(child, childClosed) : undefined,
      ]).then((results) => {
        const failures = results.filter(
          (result): result is PromiseRejectedResult => result.status === 'rejected',
        );
        if (failures.length)
          throw new Error(failures.map(({ reason }) => errorMessage(reason)).join('; '));
      });
      return cleanupPromise;
    };
    const onAbort = (): void => {
      end.resolve(signalExitCode(signal));
      void cleanup().catch(() => undefined);
    };

    let code = 1;
    try {
      progress = cliProgress(parsed, io);
      out = interrupting(io, progress);
      session = runtime.createSession({
        projectId: parsed.projectId,
        workspaceRoot: parsed.workspaceRoot,
        ...(parsed.configFile ? { configFile: parsed.configFile } : {}),
        defaults: {
          docsRoot: parsed.docsRoot,
          tsConfig: parsed.tsConfig,
          outputRoot: parsed.outputRoot,
          cacheRoot: parsed.cacheRoot,
        },
        discovery: { tags: parsed.tags },
        ...(progress ? { session: { onProgress: progress.sink } } : {}),
      });
      signal.addEventListener('abort', onAbort, { once: true });
      if (signal.aborted) onAbort();

      if (parsed.command === 'generate') {
        const result = await session.buildOnce({ mode: 'production' });
        resultOutput(result, parsed.json, out, progress, signal);
        code = signal.aborted ? signalExitCode(signal) : result.status === 'success' ? 0 : 1;
      } else {
        const preflight = await session.buildOnce({ mode: 'development' });
        resultOutput(preflight, parsed.json, out, progress, signal);
        if (signal.aborted) {
          code = signalExitCode(signal);
        } else if (preflight.status !== 'success' || !preflight.snapshot.configuration) {
          code = 1;
        } else {
          const configuration: PublishedGeneratorConfiguration = preflight.snapshot.configuration;
          const source = runtime.createEventSource(parsed.workspaceRoot, [
            configuration.outputRoot,
            configuration.cacheRoot,
            '**/node_modules/**',
          ]);
          watch = await session.watch(source, (event) => {
            if (event.kind === 'result')
              resultOutput(event.result, parsed.json, out, progress, signal);
            else if (event.kind === 'diagnostic') {
              diagnosticOutput(event, parsed.json, out);
              if (event.diagnostic.severity === 'error') {
                watchUnusable = true;
                end.resolve(1);
              }
            } else if (event.kind === 'disposed' && !signal.aborted) {
              watchUnusable = true;
              end.resolve(1);
            }
          });
          const reconciled = await watch.initial;
          if (signal.aborted) {
            code = signalExitCode(signal);
          } else if (reconciled.status !== 'success' || watchUnusable) {
            code = 1;
          } else {
            if (parsed.host.length) {
              child = runtime.spawnHost(parsed.host[0], parsed.host.slice(1), parsed.workspaceRoot);
              childClosed = hostExit(child, out);
              // The host owns the terminal now: result lines only, no redraw, no notices.
              progress?.setForeign('summaries');
              void childClosed.then((exitCode) => end.resolve(exitCode));
            }
            code = await end.promise;
          }
        }
      }
    } catch (error) {
      out.stderr(`${errorMessage(error)}\n`);
      code = signal.aborted ? signalExitCode(signal) : 1;
    } finally {
      signal.removeEventListener('abort', onAbort);
      try {
        await cleanup();
      } catch (error) {
        out.stderr(`Cleanup failed: ${errorMessage(error)}\n`);
        if (code === 0) code = 1;
      } finally {
        progress?.dispose();
      }
    }
    return code;
  };
}

export const runGeneratorCli = createGeneratorCli(defaultRuntime);
