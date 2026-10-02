import type { ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { spawnOwnedHost, stopHost } from '../cli';
import {
  type ExecFile,
  killWindowsProcessTree,
  nodeEntry,
  quoteWindowsArgument,
  resolveWindowsCommand,
  windowsSpawnPlan,
} from '../process-tree';

const windows = process.platform === 'win32';
const children = new Set<ChildProcess>();
const roots: string[] = [];

afterEach(async () => {
  const running = [...children].filter(
    (child) => child.exitCode === null && child.signalCode === null,
  );
  for (const child of running) child.kill('SIGKILL');
  // Windows refuses to remove a directory that is a live process's working directory (EPERM), and
  // a killed process ends asynchronously, so the roots go only once every child has closed.
  await Promise.all(running.map((child) => closed(child)));
  children.clear();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function temporary(): string {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ng-doc-process-tree-')));
  roots.push(root);
  return root;
}

function closed(child: ChildProcess): Promise<number> {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) resolve(child.exitCode ?? 1);
    else child.once('close', (code) => resolve(code ?? 1));
  });
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false;
    throw error;
  }
}

async function eventually(predicate: () => boolean, timeoutMs: number = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Timed out');
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

describe('POSIX host process groups', () => {
  // macOS answers EPERM, not ESRCH, for a group whose members have all exited while one is not
  // reaped yet; under load the stop's probes land in that window. Here every call on the host's
  // group answers EPERM from its SIGTERM until Node reports the host's exit.
  it.skipIf(windows)(
    'stops a host whose exited, unreaped group answers EPERM',
    async () => {
      const child = spawnOwnedHost(
        process.execPath,
        ['-e', 'setInterval(() => {}, 1000)'],
        temporary(),
      );
      children.add(child);
      const done = closed(child);
      await eventually(() => child.pid !== undefined);
      let exited = false;
      child.once('exit', () => (exited = true));
      const original = process.kill.bind(process);
      let terminated = false;
      let answered = 0;
      const kill = vi.spyOn(process, 'kill').mockImplementation((pid, signal) => {
        if (pid !== -child.pid! || !terminated || exited) {
          const result = original(pid, signal);
          if (pid === -child.pid! && signal === 'SIGTERM') terminated = true;
          return result;
        }
        answered++;
        throw Object.assign(new Error('kill EPERM'), { code: 'EPERM', syscall: 'kill' });
      });
      try {
        await expect(stopHost(child, done)).resolves.toBeUndefined();
      } finally {
        kill.mockRestore();
      }
      expect(answered).toBeGreaterThan(0);
      expect(child.signalCode).toBe('SIGTERM');
      expect(() => process.kill(-child.pid!, 0)).toThrow(/ESRCH/);
    },
    20_000,
  );
});

describe('Windows command resolution', () => {
  const files = new Set([
    'C:\\tools\\ng.CMD',
    'C:\\tools\\ng.exe',
    'C:\\bin\\vite.cmd',
    'C:\\bin\\node.exe',
    'C:\\work\\scripts\\serve.bat',
    'C:\\work\\local.exe',
    'D:\\explicit\\tool.ps1',
  ]);
  // Windows file names are case-insensitive.
  const isFile = (file: string) =>
    [...files].some((candidate) => candidate.toLowerCase() === file.toLowerCase());

  it('tries each PATHEXT extension in order, in the working directory and then PATH', () => {
    const env = { Path: 'C:\\tools;C:\\bin', PATHEXT: '.EXE;.CMD' };
    expect(resolveWindowsCommand('ng', { cwd: 'C:\\work', env, isFile })).toBe('C:\\tools\\ng.EXE');
    expect(resolveWindowsCommand('vite', { cwd: 'C:\\work', env, isFile })).toBe(
      'C:\\bin\\vite.CMD',
    );
    expect(resolveWindowsCommand('local', { cwd: 'C:\\work', env, isFile })).toBe(
      'C:\\work\\local.EXE',
    );
    expect(resolveWindowsCommand('missing', { cwd: 'C:\\work', env, isFile })).toBeUndefined();
  });

  it('lets a script in the working directory shadow a PATH shim when PATHEXT lists its extension', () => {
    // The default PATHEXT of a Windows installation (and of the GitHub runners) lists `.JS`.
    const env = {
      PATH: 'C:\\work\\node_modules\\.bin',
      PATHEXT: '.COM;.EXE;.BAT;.CMD;.VBS;.VBE;.JS;.JSE;.WSF;.WSH;.MSC',
    };
    const layout =
      (...paths: string[]) =>
      (file: string) =>
        paths.some((candidate) => candidate.toLowerCase() === file.toLowerCase());
    const shim = 'C:\\work\\node_modules\\.bin\\echo-args.cmd';
    expect(
      resolveWindowsCommand('echo-args', {
        cwd: 'C:\\work',
        env,
        isFile: layout(shim, 'C:\\work\\echo-args.js'),
      }),
    ).toBe('C:\\work\\echo-args.JS');
    expect(
      resolveWindowsCommand('echo-args', {
        cwd: 'C:\\work',
        env,
        isFile: layout(shim, 'C:\\work\\scripts\\echo-args.js'),
      }),
    ).toBe('C:\\work\\node_modules\\.bin\\echo-args.CMD');
  });

  it('uses the default PATHEXT and resolves paths against the working directory', () => {
    const env = { PATH: 'C:\\tools' };
    expect(resolveWindowsCommand('ng', { cwd: 'C:\\work', env, isFile })).toBe('C:\\tools\\ng.EXE');
    expect(resolveWindowsCommand('scripts\\serve', { cwd: 'C:\\work', env, isFile })).toBe(
      'C:\\work\\scripts\\serve.BAT',
    );
    expect(resolveWindowsCommand('./scripts/serve.bat', { cwd: 'C:\\work', env, isFile })).toBe(
      'C:\\work\\scripts\\serve.bat',
    );
    expect(
      resolveWindowsCommand('D:\\explicit\\tool.ps1', { cwd: 'C:\\work', env: {}, isFile }),
    ).toBe('D:\\explicit\\tool.ps1');
    expect(resolveWindowsCommand('ng', { cwd: 'C:\\work', env: {}, isFile })).toBeUndefined();
  });

  it('checks the real filesystem by default', () => {
    const root = temporary();
    fs.writeFileSync(path.join(root, 'present.cmd'), '');
    fs.mkdirSync(path.join(root, 'folder.cmd'));
    const options = { cwd: root, env: { PATHEXT: '.cmd' } };
    // Windows path rules: only a Windows working directory resolves to a real file.
    expect(resolveWindowsCommand('present', options)).toBe(
      windows ? path.join(root, 'present.cmd') : undefined,
    );
    expect(resolveWindowsCommand('folder', options)).toBeUndefined();
  });
});

describe('Windows command lines', () => {
  it('quotes arguments for cmd.exe and the program', () => {
    expect(quoteWindowsArgument('plain')).toBe('^"plain^"');
    expect(quoteWindowsArgument('a b')).toBe('^"a^ b^"');
    expect(quoteWindowsArgument('x&y|z')).toBe('^"x^&y^|z^"');
    expect(quoteWindowsArgument('say "hi"')).toBe('^"say^ \\^"hi\\^"^"');
    expect(quoteWindowsArgument('C:\\dir\\')).toBe('^"C:\\dir\\\\^"');
    expect(quoteWindowsArgument('%PATH%')).toBe('^"^%PATH^%^"');
    expect(quoteWindowsArgument('')).toBe('^"^"');
    expect(quoteWindowsArgument('a b', true)).toBe('^^^"a^^^ b^^^"');
  });

  it('starts executables directly and batch files through cmd.exe', () => {
    const isFile = (file: string) =>
      [
        'C:\\bin\\node.exe',
        'C:\\app\\node_modules\\.bin\\ng.cmd',
        'C:\\Program Files\\tools\\serve.bat',
      ].includes(file);
    const env = {
      PATH: 'C:\\bin;C:\\app\\node_modules\\.bin;C:\\Program Files\\tools',
      PATHEXT: '.exe;.cmd;.bat',
    };
    expect(windowsSpawnPlan('node', ['-e', 'a b'], { cwd: 'C:\\app', env, isFile })).toEqual({
      file: 'C:\\bin\\node.exe',
      args: ['-e', 'a b'],
      verbatim: false,
    });
    expect(windowsSpawnPlan('missing', ['x'], { cwd: 'C:\\app', env, isFile })).toEqual({
      file: 'missing',
      args: ['x'],
      verbatim: false,
    });
    // An npm shim forwards its arguments to node, so they are escaped twice.
    expect(
      windowsSpawnPlan('ng', ['serve', '--port', '4200'], { cwd: 'C:\\app', env, isFile }),
    ).toEqual({
      file: 'cmd.exe',
      args: [
        '/d',
        '/s',
        '/c',
        '"C:\\app\\node_modules\\.bin\\ng.cmd ^^^"serve^^^" ^^^"--port^^^" ^^^"4200^^^""',
      ],
      verbatim: true,
    });
    expect(
      windowsSpawnPlan('serve', ['a&b'], {
        cwd: 'C:\\app',
        env: { ...env, ComSpec: 'C:\\Windows\\System32\\cmd.exe' },
        isFile,
      }),
    ).toEqual({
      file: 'C:\\Windows\\System32\\cmd.exe',
      args: ['/d', '/s', '/c', '"C:\\Program^ Files\\tools\\serve.bat ^"a^&b^""'],
      verbatim: true,
    });
  });
  it('treats a batch file name with trailing dots or spaces as a batch file', () => {
    const isFile = (file: string) => ['C:\\work\\x.bat.', 'C:\\work\\x.bat '].includes(file);
    const env = { PATH: 'C:\\bin', PATHEXT: '.exe;.cmd;.bat' };
    for (const command of ['.\\x.bat.', '.\\x.bat ']) {
      expect(() => windowsSpawnPlan(command, ['a"b'], { cwd: 'C:\\work', env, isFile })).toThrow(
        /batch files/,
      );
    }
  });
});

describe('Windows process trees', () => {
  it('ends a tree with taskkill and never rejects', async () => {
    const calls: unknown[][] = [];
    const run: ExecFile = (file, args, options, callback) => {
      calls.push([file, args, options]);
      callback(new Error('not found'));
    };
    await expect(killWindowsProcessTree(42, run)).resolves.toBeUndefined();
    expect(calls).toEqual([['taskkill', ['/PID', '42', '/T', '/F'], { windowsHide: true }]]);
    await expect(
      killWindowsProcessTree(42, () => {
        throw new Error('spawn failed');
      }),
    ).resolves.toBeUndefined();
    // The real taskkill; outside Windows it is missing, which is not an error either.
    await expect(killWindowsProcessTree(2 ** 30)).resolves.toBeUndefined();
  });

  it('supervises a host as a process tree when the platform is Windows', async () => {
    const killed: number[] = [];
    // Natively the real taskkill ends the tree; elsewhere the simulated one ends the host.
    const killTree = windows
      ? undefined
      : async (pid: number) => {
          killed.push(pid);
          process.kill(pid, 'SIGKILL');
        };
    const child = spawnOwnedHost(
      process.execPath,
      ['-e', 'setInterval(() => {}, 1000)'],
      temporary(),
      { platform: 'win32', ...(killTree ? { killTree } : {}) },
    );
    children.add(child);
    const done = closed(child);
    await eventually(() => child.pid !== undefined);
    await stopHost(child, done);
    expect(child.exitCode !== null || child.signalCode !== null).toBe(true);
    if (!windows) expect(killed).toEqual([child.pid]);
    // A host that already exited is only awaited.
    await expect(stopHost(child, done)).resolves.toBeUndefined();
  }, 20_000);

  it('reports a Windows host tree that does not stop', async () => {
    const child = spawnOwnedHost(
      process.execPath,
      ['-e', 'setInterval(() => {}, 1000)'],
      temporary(),
      { platform: 'win32', killTree: async () => undefined },
    );
    children.add(child);
    await eventually(() => child.pid !== undefined);
    await expect(stopHost(child, closed(child))).rejects.toThrow(
      `Host process tree ${child.pid} did not stop.`,
    );
  }, 20_000);

  it.runIf(windows)(
    'ends a native host tree, grandchildren included',
    async () => {
      const root = temporary();
      const ready = path.join(root, 'grandchild.pid');
      const grandchild = `require('node:fs').writeFileSync(${JSON.stringify(ready)}, String(process.pid)); setInterval(() => {}, 1000);`;
      const parent = `require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(grandchild)}], { stdio: 'ignore' }); setInterval(() => {}, 1000);`;
      const child = spawnOwnedHost(process.execPath, ['-e', parent], root);
      children.add(child);
      const done = closed(child);
      await eventually(() => fs.existsSync(ready));
      const grandchildPid = Number(fs.readFileSync(ready, 'utf8'));
      expect(alive(grandchildPid)).toBe(true);
      await stopHost(child, done);
      await eventually(() => !alive(grandchildPid));
    },
    30_000,
  );

  it.runIf(windows)(
    'passes arguments through an npm .cmd shim unchanged',
    async () => {
      const root = temporary();
      const bin = path.join(root, 'node_modules', '.bin');
      fs.mkdirSync(bin, { recursive: true });
      const out = path.join(root, 'argv.json');
      // Not `echo-args.js` in the working directory: `cmd.exe` searches it first, and a PATHEXT
      // that lists `.JS` (the Windows default) would resolve the command to that script instead
      // of the shim.
      const script = path.join(root, 'scripts', 'echo-args.js');
      fs.mkdirSync(path.dirname(script));
      fs.writeFileSync(
        script,
        `require('node:fs').writeFileSync(${JSON.stringify(out)}, JSON.stringify(process.argv.slice(2)));`,
      );
      // The shape npm writes for a package binary.
      fs.writeFileSync(
        path.join(bin, 'echo-args.cmd'),
        `@ECHO off\r\n"${process.execPath}" "${script}" %*\r\n`,
      );
      const args = [
        'plain',
        'a b',
        'x&y|z',
        'caret^',
        'C:\\dir\\',
        '(paren)',
        '<in>',
        'semi;colon',
      ];
      const env = { ...process.env, PATH: `${bin};${process.env['PATH'] ?? ''}` };
      const child = spawnOwnedHost('echo-args', args, root, { env });
      children.add(child);
      expect(await closed(child)).toBe(0);
      expect(JSON.parse(fs.readFileSync(out, 'utf8'))).toEqual(args);
      for (const unsafe of ['q"&calc&"', '%PATH:a=b%', '!bang!', 'line\nbreak']) {
        expect(() => spawnOwnedHost('echo-args', [unsafe], root, { env })).toThrow(
          /Cannot pass .* to echo-args\.cmd/,
        );
      }
    },
    30_000,
  );

  it.runIf(windows)(
    'runs npx through Node, so no cmd.exe parses its arguments',
    async () => {
      const child = spawnOwnedHost('npx', ['--version'], temporary());
      children.add(child);
      expect(child.spawnfile).toBe(process.execPath);
      expect(await closed(child)).toBe(0);
    },
    60_000,
  );
});

describe('ng, npm and npx on Windows', () => {
  const files = new Set([
    'C:\\work\\node_modules\\@angular\\cli\\bin\\ng.js',
    'C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npx-cli.js',
    'C:\\Users\\me\\AppData\\Roaming\\npm\\npm.cmd',
    'C:\\Users\\me\\AppData\\Roaming\\npm\\tool.cmd',
  ]);
  const isFile = (file: string) =>
    [...files].some((candidate) => candidate.toLowerCase() === file.toLowerCase());
  const options = {
    cwd: 'C:\\work\\apps\\docs',
    env: { PATH: 'C:\\Users\\me\\AppData\\Roaming\\npm', PATHEXT: '.cmd' },
    execPath: 'C:\\Program Files\\nodejs\\node.exe',
    isFile,
  };

  it('finds the project Angular CLI and the npx beside Node', () => {
    expect(nodeEntry('ng', options)).toBe('C:\\work\\node_modules\\@angular\\cli\\bin\\ng.js');
    expect(nodeEntry('NG.cmd', options)).toBe('C:\\work\\node_modules\\@angular\\cli\\bin\\ng.js');
    expect(nodeEntry('npx', options)).toBe(
      'C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npx-cli.js',
    );
    expect(nodeEntry('npm', options)).toBeUndefined();
    expect(nodeEntry('ng', { ...options, cwd: 'D:\\elsewhere' })).toBeUndefined();
    expect(nodeEntry('vite', options)).toBeUndefined();
    expect(nodeEntry('tools\\ng', options)).toBeUndefined();
  });

  it('starts them with Node and an argument array, whatever the arguments hold', () => {
    const args = ['serve', 'q"&calc&"', '%PATH:a=b%', '!x!', 'a\r\nb'];
    expect(windowsSpawnPlan('ng', args, options)).toEqual({
      file: 'C:\\Program Files\\nodejs\\node.exe',
      args: ['C:\\work\\node_modules\\@angular\\cli\\bin\\ng.js', ...args],
      verbatim: false,
    });
    expect(windowsSpawnPlan('npx', ['vite', '%X%'], options).args).toEqual([
      'C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npx-cli.js',
      'vite',
      '%X%',
    ]);
  });

  it('refuses arguments that no quoting protects through a batch file', () => {
    // npm without its entry beside Node falls back to the global npm.cmd shim.
    for (const unsafe of ['q"&calc&"', '%NAME:a=b%', '!x!', 'a\rb', 'a\nb']) {
      expect(() => windowsSpawnPlan('npm', ['run', unsafe], options)).toThrow(
        `Cannot pass ${JSON.stringify(unsafe)} to npm.cmd`,
      );
      expect(() => windowsSpawnPlan('tool', [unsafe], options)).toThrow(/tool\.cmd/);
    }
    expect(windowsSpawnPlan('tool', ['a&b', 'c d'], options)).toMatchObject({ verbatim: true });
  });

  it('uses the running Node by default', () => {
    const plan = windowsSpawnPlan('ng', ['build'], {
      cwd: 'C:\\work',
      env: {},
      isFile,
    });
    expect(plan.file).toBe(process.execPath);
  });
});
