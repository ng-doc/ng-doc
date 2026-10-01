import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';

import { prepare } from '../../../../../plugins/semantic-release/update-dependencies.js';
import { withRetry } from '../../../../../tools/scripts/generator-output.mjs';

/** Every published package: `ng add @ng-doc/add` installs `add`, which pulls in the rest. */
export const PACKAGES = Object.freeze([
  'add',
  'builder',
  'core',
  'utils',
  'app',
  'ui-kit',
  'keywords-loaders',
]);

const windows = process.platform === 'win32';

/** The npm CLI of the running Node, started through Node itself so that no `.cmd` shim is needed. */
export function npmCli(execPath = process.execPath, exists = existsSync) {
  const directory = path.dirname(execPath);
  const candidates = [
    process.env.npm_execpath,
    path.join(directory, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    path.join(directory, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ];
  const found = candidates.find(
    (candidate) => candidate?.endsWith('npm-cli.js') && exists(candidate),
  );
  if (!found) throw new Error(`The npm CLI of ${execPath} was not found.`);
  return found;
}

/**
 * The environment every harness command runs with: the running Node first on PATH (so `ng add`
 * installs with this Node's npm), non-interactive Angular and Nx, and npm pointed at `cache`.
 */
export function commandEnvironment(cache, base = process.env) {
  const env = { ...base };
  const pathKey = Object.keys(env).find((key) => key.toUpperCase() === 'PATH') ?? 'PATH';
  env[pathKey] = [path.dirname(process.execPath), env[pathKey]]
    .filter(Boolean)
    .join(path.delimiter);
  delete env.NODE_PATH;
  delete env.NODE_OPTIONS;
  return {
    ...env,
    CI: 'true',
    NG_CLI_ANALYTICS: 'false',
    NG_FORCE_TTY: 'false',
    NX_DAEMON: 'false',
    NX_NO_CLOUD: 'true',
    NX_TUI: 'false',
    npm_config_cache: cache,
    npm_config_audit: 'false',
    npm_config_fund: 'false',
    npm_config_update_notifier: 'false',
    npm_config_prefer_offline: 'true',
  };
}

/** Ends a started command and everything it started: its process group, or its Windows tree. */
export function killTree(pid, run = execFile) {
  if (windows) {
    return new Promise((resolve) => {
      run('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true }, () => resolve());
    });
  }
  try {
    process.kill(-pid, 'SIGKILL');
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
  return Promise.resolve();
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

/** Every command started and not yet settled, for signal cleanup ({@link stopAll}). */
const active = new Set();

/** How long output is awaited after a command exits, and how long a stop waits for the exit. */
export const OUTPUT_GRACE_MS = 5_000;
export const STOP_GRACE_MS = 15_000;

/**
 * Starts `file` with `args` without a shell, as the leader of its own process group on POSIX.
 * Output goes to `log` and is kept for assertions. `exit` settles once the command has exited
 * and its output has ended, or {@link OUTPUT_GRACE_MS} later: a descendant that inherited the
 * pipes keeps them open, and on Windows it can't be found once its parent is gone. `stop()` ends
 * the whole tree and waits, bounded.
 */
export function start(file, args, { cwd, env, log }) {
  const child = spawn(file, args, {
    cwd,
    env,
    detached: !windows,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let output = '';
  const chunks = [];
  const collect = (chunk) => {
    const text = chunk.toString('utf8');
    output += text;
    if (output.length > 2_000_000) output = output.slice(-1_000_000);
    chunks.push(text);
  };
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);
  const exited = new Promise((resolve) => {
    child.once('error', (error) => resolve({ code: null, signal: null, error }));
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
  const closed = new Promise((resolve) => child.once('close', resolve));
  const running = () => child.exitCode === null && child.signalCode === null;
  const handle = {
    child,
    output: () => output,
    exit: undefined,
    async stop() {
      // While the leader runs, its tree (Windows) or group (POSIX) is ended; after it exited, only
      // the POSIX group can still be found.
      if (child.pid !== undefined && (running() || !windows)) await killTree(child.pid);
      const settled = await Promise.race([handle.exit.then(() => true), delay(STOP_GRACE_MS)]);
      if (!settled && running()) child.kill('SIGKILL');
      return handle.exit;
    },
  };
  handle.exit = exited.then(async (result) => {
    await Promise.race([closed, delay(OUTPUT_GRACE_MS)]);
    child.stdout.destroy();
    child.stderr.destroy();
    active.delete(handle);
    if (log) {
      await mkdir(path.dirname(log), { recursive: true });
      await writeFile(
        log,
        `$ ${[file, ...args].join(' ')}\n(cwd ${cwd})\n${chunks.join('')}\n${JSON.stringify(result)}\n`,
      );
    }
    return result;
  });
  active.add(handle);
  return handle;
}

/** Stops every command that is still running (signal cleanup). */
export async function stopAll() {
  await Promise.allSettled([...active].map((handle) => handle.stop()));
}

/** Runs a command to completion within `timeoutMs`, ending its tree on timeout; throws on failure. */
export async function run(file, args, { cwd, env, log, timeoutMs = 600_000 }) {
  const command = start(file, args, { cwd, env, log });
  let timer;
  const timedOut = new Promise((resolve) => {
    timer = setTimeout(() => resolve('timeout'), timeoutMs);
  });
  const outcome = await Promise.race([command.exit, timedOut]);
  clearTimeout(timer);
  // A command that exited may leave descendants in its group (POSIX); end them too.
  const result = await command.stop();
  if (outcome === 'timeout') {
    throw new Error(
      `${path.basename(file)} ${args.join(' ')} timed out after ${timeoutMs} ms.\n${command.output().slice(-4000)}`,
    );
  }
  if (result.error || result.code !== 0) {
    throw new Error(
      `${path.basename(file)} ${args.join(' ')} failed (${result.error?.message ?? `code ${result.code}, signal ${result.signal}`}).\n${command.output().slice(-6000)}`,
    );
  }
  return command.output();
}

/**
 * Copies the built packages out of `dist/libs`, pins their dependencies on each other to their
 * own version (as the release does), and packs each one with npm.
 */
export async function packPackages({ repository, directory, env, logs }) {
  const snapshot = path.join(directory, 'packages');
  for (const name of PACKAGES) {
    const source = path.join(repository, 'dist', 'libs', name);
    if (!existsSync(path.join(source, 'package.json'))) {
      throw new Error(`dist/libs/${name} is missing: build the package set first.`);
    }
    await cp(source, path.join(snapshot, name), { recursive: true });
  }
  // The release's dependency pinning, silenced.
  prepare(
    { packages: PACKAGES.map((name) => path.join(snapshot, name)) },
    { logger: { log: () => undefined } },
  );
  const npm = npmCli();
  const packed = {};
  for (const name of PACKAGES) {
    const folder = path.join(snapshot, name);
    const stdout = await run(
      process.execPath,
      [npm, 'pack', '--json', '--pack-destination', snapshot],
      {
        cwd: folder,
        env,
        log: path.join(logs, `pack-${name}.log`),
        timeoutMs: 120_000,
      },
    );
    const [metadata] = JSON.parse(stdout.slice(stdout.indexOf('[')));
    const file = path.join(snapshot, metadata.filename);
    const bytes = await readFile(file);
    const manifest = JSON.parse(await readFile(path.join(folder, 'package.json'), 'utf8'));
    packed[manifest.name] = {
      file,
      manifest,
      integrity: metadata.integrity,
      shasum: createHash('sha1').update(bytes).digest('hex'),
      sha256: createHash('sha256').update(bytes).digest('hex'),
    };
  }
  return packed;
}

/**
 * A registry for the `@ng-doc` scope only, on 127.0.0.1: it serves a packument per packed package
 * and its tarball. A consumer points the scope at it in `.npmrc`, so `ng add @ng-doc/add` and every
 * install resolve the packed packages by name and version, the way users get them from npm, while
 * all other packages come from the configured registry.
 */
export async function startScopeRegistry(packed) {
  const tarballs = new Map(
    Object.values(packed).map((item) => [path.basename(item.file), item.file]),
  );
  let base = '';
  const requests = [];
  const server = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://registry').pathname);
    requests.push(`${request.method} ${pathname}`);
    const tarball = pathname.startsWith('/-/') ? tarballs.get(pathname.slice(3)) : undefined;
    if (request.method === 'GET' && tarball) {
      response.writeHead(200, {
        'content-type': 'application/octet-stream',
        'content-length': statSync(tarball).size,
      });
      createReadStream(tarball).pipe(response);
      return;
    }
    const item = packed[pathname.slice(1)];
    if (request.method === 'GET' && item) {
      const { manifest } = item;
      const body = JSON.stringify({
        _id: manifest.name,
        name: manifest.name,
        'dist-tags': { latest: manifest.version },
        versions: {
          [manifest.version]: {
            ...manifest,
            _id: `${manifest.name}@${manifest.version}`,
            dist: {
              tarball: `${base}/-/${encodeURIComponent(path.basename(item.file))}`,
              integrity: item.integrity,
              shasum: item.shasum,
            },
          },
        },
      });
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(body);
      return;
    }
    response.writeHead(404, { 'content-type': 'application/json' });
    response.end('{"error":"not found"}');
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
  return {
    url: `${base}/`,
    requests,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

/**
 * Pins every dependency of a generated application that the repository pins exactly to the
 * repository's version, so the consumer builds with the toolchain NgDoc is tested with.
 */
export function pinDependencies(application, repository) {
  const pinned = { ...repository.dependencies, ...repository.devDependencies };
  const exact = (value) => typeof value === 'string' && /^\d+\.\d+\.\d+$/.test(value);
  const result = structuredClone(application);
  for (const field of ['dependencies', 'devDependencies']) {
    for (const name of Object.keys(result[field] ?? {})) {
      if (exact(pinned[name])) result[field][name] = pinned[name];
    }
  }
  return result;
}

/** Every file under `root`, relative with forward slashes, skipping `node_modules`. */
export async function listFiles(root, relative = '') {
  const found = [];
  for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const child = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) found.push(...(await listFiles(root, child)));
    else if (entry.isFile()) found.push(child);
  }
  return found.sort();
}

/** Files under `root` whose text contains `marker`. */
export async function filesContaining(root, marker, filter = () => true) {
  const found = [];
  for (const file of await listFiles(root)) {
    if (!filter(file)) continue;
    if ((await readFile(path.join(root, file))).includes(marker)) found.push(file);
  }
  return found;
}

/** Polls `url` until it answers or `deadline` passes. */
export async function waitForHttp(url, { deadline, isAlive }) {
  let last;
  while (Date.now() < deadline) {
    if (!isAlive()) throw new Error(`The server exited before ${url} answered.`);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      return {
        status: response.status,
        type: response.headers.get('content-type') ?? '',
        body: await response.text(),
      };
    } catch (error) {
      last = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`${url} did not answer in time: ${last?.message ?? 'no attempt'}`);
}

/** Removes a directory tree; Windows retries while a scanner or a dying process holds a file. */
export function removeTree(directory) {
  return withRetry(() =>
    rm(directory, { recursive: true, force: true, maxRetries: windows ? 5 : 0 }),
  );
}
