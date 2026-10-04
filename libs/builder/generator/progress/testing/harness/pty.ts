import { build } from 'esbuild';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const RUNNER = path.join(import.meta.dirname, 'pty-run.py');

export interface PtySupport {
  available: boolean;
  /** The Python 3 interpreter that runs `pty-run.py`. */
  python?: string;
  /** Why the PTY checks cannot run here. */
  reason?: string;
}

const probe = (command: string, args: string[]) =>
  spawnSync(command, args, {
    encoding: 'utf8',
    timeout: 10_000,
    stdio: ['ignore', 'pipe', 'ignore'],
  });

/**
 * Whether the PTY checks can run here: POSIX with a working Python 3 that has the `pty` module.
 * On macOS `/usr/bin/python3` is a stub that opens an installer dialog when the Command Line Tools
 * are missing, so it is used only when `xcode-select -p` finds them. Every probe has a timeout.
 */
export function ptySupport(platform: NodeJS.Platform = process.platform): PtySupport {
  if (platform === 'win32')
    return { available: false, reason: 'Windows has no POSIX pseudo-terminal' };
  const found = probe('/bin/sh', ['-c', 'command -v python3']);
  const python = found.status === 0 ? found.stdout.trim() : '';
  if (!python) return { available: false, reason: 'python3 is not on PATH' };
  if (
    platform === 'darwin' &&
    python === '/usr/bin/python3' &&
    probe('xcode-select', ['-p']).status !== 0
  )
    return {
      available: false,
      reason: '/usr/bin/python3 is the macOS stub without Command Line Tools',
    };
  if (probe(python, ['-c', 'import fcntl, pty, termios']).status !== 0)
    return { available: false, reason: `${python} cannot import the pty module` };
  return { available: true, python };
}

/** Bundles the harness child into `directory` and returns the entry path. */
export async function bundleChild(directory: string): Promise<string> {
  const outfile = path.join(directory, 'child.mjs');
  await build({
    entryPoints: [path.join(import.meta.dirname, 'child.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    outfile,
    logLevel: 'silent',
  });
  return outfile;
}

export interface RunResult {
  /** Everything the process wrote (PTY: both streams, interleaved as the terminal saw them). */
  output: string;
  stdout: string;
  stderr: string;
  exit: number | null;
  /** The signal that ended the process (PTY runs only). */
  signal?: number | null;
  timeout: boolean;
}

/** Clean environment: the caller's variables only, never the test runner's CI or Nx variables. */
export function cleanEnv(extra: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const keep = ['PATH', 'HOME', 'TMPDIR', 'LANG', 'SYSTEMROOT'];
  const env: NodeJS.ProcessEnv = {};
  for (const key of keep) if (process.env[key] !== undefined) env[key] = process.env[key];
  return { ...env, ...extra };
}

/** Runs `node <entry> ...args` in a PTY of `rows`×`columns`. */
export async function runInPty(
  entry: string,
  args: string[],
  options: {
    rows: number;
    columns: number;
    env: NodeJS.ProcessEnv;
    timeoutMs?: number;
    python?: string;
    /** Types Ctrl-C once the output contains this text. */
    ctrlCOn?: string;
    /** Sends `signal` to the program once the output contains `text`. */
    killOn?: { text: string; signal: 'TERM' | 'HUP' };
  },
): Promise<RunResult> {
  const directory = mkdtempSync(path.join(tmpdir(), 'ngdoc-progress-pty-'));
  const out = path.join(directory, 'out.raw');
  try {
    const timeout = (options.timeoutMs ?? 30_000) / 1000;
    const python = options.python ?? 'python3';
    const { stdout, code } = await run(
      python,
      [
        RUNNER,
        String(options.rows),
        String(options.columns),
        String(timeout),
        out,
        process.execPath,
        entry,
        ...args,
      ],
      {
        ...options.env,
        ...(options.ctrlCOn ? { PTY_CTRL_C_ON: options.ctrlCOn } : {}),
        ...(options.killOn
          ? { PTY_KILL_ON: options.killOn.text, PTY_KILL_SIGNAL: options.killOn.signal }
          : {}),
      },
      options.timeoutMs ?? 30_000,
    );
    const report = JSON.parse(stdout.trim().split('\n').at(-1) ?? '{}') as {
      exit?: number | null;
      signal?: number | null;
      timeout?: boolean;
    };
    if (code !== 0) throw new Error(`pty-run.py exited ${code}`);
    const output = readFileSync(out, 'utf8');
    return {
      output,
      stdout: output,
      stderr: output,
      exit: report.exit ?? null,
      signal: report.signal ?? null,
      timeout: report.timeout === true,
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

/** Runs `node <entry> ...args` with piped (non-TTY) streams. */
export async function runPiped(
  entry: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  timeoutMs: number = 30_000,
): Promise<RunResult> {
  const result = await run(process.execPath, [entry, ...args], env, timeoutMs);
  return {
    output: result.stderr + result.stdout,
    stdout: result.stdout,
    stderr: result.stderr,
    exit: result.code,
    timeout: result.timeout,
  };
}

function run(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  timeoutMs: number,
): Promise<{ stdout: string; stderr: string; code: number | null; timeout: boolean }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let timeout = false;
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => (stdout += chunk));
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => (stderr += chunk));
    // A second deadline over the runner's own: never leave a process behind.
    const timer = setTimeout(() => {
      timeout = true;
      child.kill('SIGKILL');
    }, timeoutMs + 5_000);
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code, timeout });
    });
  });
}
