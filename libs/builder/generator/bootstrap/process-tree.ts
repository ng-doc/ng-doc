import { execFile } from 'node:child_process';
import { statSync } from 'node:fs';
import path from 'node:path';

/**
 * Process supervision on Windows, which has no POSIX process groups: a process is ended together
 * with every process it started (`taskkill /T`, which follows parent links while they exist), and
 * a command is resolved the way `cmd.exe` resolves it, because `spawn` without a shell finds only
 * `.exe` files and Node refuses to start a `.cmd` or `.bat` file without one.
 */

/** How `spawn` starts a command on Windows. */
export interface WindowsSpawnPlan {
  readonly file: string;
  readonly args: readonly string[];
  /** The arguments are one command line for `cmd.exe`, already quoted. */
  readonly verbatim: boolean;
}

export interface WindowsCommandOptions {
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
  /** The Node that starts `ng`, `npm` and `npx` directly; `process.execPath` by default. */
  readonly execPath?: string;
  /** @internal Test port. */
  readonly isFile?: (file: string) => boolean;
}

/**
 * Characters that no quoting protects through `cmd.exe` and a batch file's own parse: `"` ends the
 * quoting, `%` and `!` expand variables (`%NAME:a=b%` edits them) inside quotes too, and a line
 * break ends the command.
 */
const UNQUOTABLE = /["%!\r\n]/;

/** Characters `cmd.exe` interprets; each is escaped with `^`. */
const CMD_META = /([()\][%!^"`<>&|;, *?])/g;
const DEFAULT_PATHEXT = '.COM;.EXE;.BAT;.CMD';

function isFile(file: string): boolean {
  try {
    return statSync(file).isFile();
  } catch {
    return false;
  }
}

/** An environment variable by its Windows name, which is case-insensitive. */
function variable(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const key = Object.keys(env).find((candidate) => candidate.toUpperCase() === name);
  return key === undefined ? undefined : env[key];
}

/**
 * The file `cmd.exe` would run for `command`: a path is resolved against `cwd`, a bare name
 * against the working directory and then `PATH`; without an extension, each `PATHEXT` extension is
 * tried in order. Undefined when nothing matches.
 */
export function resolveWindowsCommand(
  command: string,
  options: WindowsCommandOptions,
): string | undefined {
  const exists = options.isFile ?? isFile;
  const extensions = (variable(options.env, 'PATHEXT') ?? DEFAULT_PATHEXT)
    .split(';')
    .filter(Boolean);
  const candidates = (base: string): string[] =>
    path.win32.extname(base) ? [base] : extensions.map((extension) => `${base}${extension}`);
  const directories = /[\\/]/.test(command)
    ? [options.cwd]
    : [
        options.cwd,
        ...(variable(options.env, 'PATH') ?? '').split(path.win32.delimiter).filter(Boolean),
      ];
  for (const directory of directories) {
    for (const candidate of candidates(path.win32.resolve(directory, command))) {
      if (exists(candidate)) return candidate;
    }
  }
  return undefined;
}

/**
 * Quotes one argument for `cmd.exe /s /c "…"` and for the program's own command-line parser
 * (backslashes before a quote doubled, the argument quoted, metacharacters escaped). A batch file
 * that forwards its arguments to another program (the `node_modules/.bin` shims) parses the line
 * twice, so its metacharacters are escaped twice. The same rules as the `cross-spawn` package.
 */
export function quoteWindowsArgument(value: string, twice: boolean = false): string {
  let quoted = value.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\*)$/, '$1$1');
  quoted = `"${quoted}"`.replace(CMD_META, '^$1');
  return twice ? quoted.replace(CMD_META, '^$1') : quoted;
}

/**
 * The JavaScript entry of `ng`, `npm` or `npx` given as a bare name: the Angular CLI of the
 * project (the nearest `node_modules/@angular/cli` above `cwd`), and the npm beside `execPath`
 * (the Windows Node layout). Undefined for any other command, or when the entry is missing.
 */
export function nodeEntry(command: string, options: WindowsCommandOptions): string | undefined {
  const exists = options.isFile ?? isFile;
  const name = /^(ng|npm|npx)(?:\.cmd)?$/i.exec(command)?.[1]?.toLowerCase();
  if (!name) return undefined;
  if (name !== 'ng') {
    const entry = path.win32.join(
      path.win32.dirname(options.execPath ?? process.execPath),
      'node_modules',
      'npm',
      'bin',
      `${name}-cli.js`,
    );
    return exists(entry) ? entry : undefined;
  }
  for (let directory = path.win32.resolve(options.cwd); ; ) {
    const entry = path.win32.join(directory, 'node_modules', '@angular', 'cli', 'bin', 'ng.js');
    if (exists(entry)) return entry;
    const parent = path.win32.dirname(directory);
    if (parent === directory) return undefined;
    directory = parent;
  }
}

/**
 * How to start `command` with `args` on Windows without a shell of the user's choosing:
 * - `ng`, `npm` and `npx` through Node itself (their JavaScript entry, see {@link nodeEntry}),
 *   with the arguments as an array, so no `cmd.exe` parses them;
 * - an executable directly;
 * - any other `.cmd` or `.bat` file through `cmd.exe /d /s /c` with every argument quoted. An
 *   argument that quoting cannot protect there (`"`, `%`, `!`, CR or LF) is refused with an error
 *   that names it.
 *
 * A command that does not resolve is started as given, and `spawn` reports it missing.
 */
// Windows ignores trailing dots and spaces in file names, so `x.bat.` and `x.bat ` still run as
// batch files through cmd.exe and need the same argument checks.
function isBatchFile(file: string): boolean {
  return /\.(?:cmd|bat)$/i.test(file.replace(/[. ]+$/, ''));
}

export function windowsSpawnPlan(
  command: string,
  args: readonly string[],
  options: WindowsCommandOptions,
): WindowsSpawnPlan {
  const entry = nodeEntry(command, options);
  if (entry) {
    return { file: options.execPath ?? process.execPath, args: [entry, ...args], verbatim: false };
  }
  const file = resolveWindowsCommand(command, options);
  if (!file || !isBatchFile(file)) return { file: file ?? command, args, verbatim: false };
  const unsafe = args.find((arg) => UNQUOTABLE.test(arg));
  if (unsafe !== undefined) {
    throw new Error(
      `Cannot pass ${JSON.stringify(unsafe)} to ${path.win32.basename(file)}: Windows runs batch files through cmd.exe, which can't take '"', '%', '!' or line breaks safely in an argument. Start the program itself (for example \`node <script>\`) instead.`,
    );
  }
  const shim = /node_modules[\\/]\.bin[\\/][^\\/]+\.cmd$/i.test(file);
  const line = [
    path.win32.normalize(file).replace(CMD_META, '^$1'),
    ...args.map((arg) => quoteWindowsArgument(arg, shim)),
  ].join(' ');
  return {
    file: variable(options.env, 'COMSPEC') ?? 'cmd.exe',
    args: ['/d', '/s', '/c', `"${line}"`],
    verbatim: true,
  };
}

export type ExecFile = (
  file: string,
  args: readonly string[],
  options: { windowsHide: boolean },
  callback: (error: Error | null) => void,
) => unknown;

/**
 * Ends `pid` and every process it started (`taskkill /PID <pid> /T /F`). Resolves once taskkill
 * has finished; a process that is already gone is not an error, the caller checks the exit.
 */
export function killWindowsProcessTree(
  pid: number,
  run: ExecFile = execFile as unknown as ExecFile,
): Promise<void> {
  return new Promise((resolve) => {
    try {
      run('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true }, () => resolve());
    } catch {
      resolve();
    }
  });
}
