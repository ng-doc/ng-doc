import fs, { existsSync, realpathSync } from 'node:fs';
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { type FSWatcher, type Plugin, type ViteDevServer, createServer } from 'vite';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createNgDocVitePlugin } from '..';
import { qualifyAngularPlugins } from '../angular-compatibility';

/**
 * Watch scope of the Vite/Analog development host:
 * 1. The native watcher is attached only inside the workspace. The compiler's configuration
 *    lookups in every directory above it (`.editorconfig`, `.prettierrc*`, `package.json`, ...)
 *    are polled, so chokidar's FSEvents streams are no longer consolidated to `/` and `/Users`,
 *    and a probe created later is still noticed.
 * 2. An edit reloads the browser once: the adapter's coordinated reload, not also Vite's own
 *    module-graph reload for the committed generated module.
 */

/** The external probe poll interval (1 s), with room for a loaded machine. */
const PROBE_DEADLINE_MS = 10_000;

/**
 * Fault injection for the superseded-commit case: runs once while the committer removes a stage
 * directory.
 */
const stage = vi.hoisted(() => ({ removing: undefined as undefined | (() => Promise<void>) }));
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    rm: async (...args: Parameters<typeof actual.rm>) => {
      const hook = stage.removing;
      if (hook && String(args[0]).includes('.ng-doc-stage-')) {
        stage.removing = undefined;
        await hook();
      }
      return actual.rm(...args);
    },
  };
});

const repository = path.resolve(import.meta.dirname, '../../../../..');
const temporary: string[] = [];
const servers: ViteDevServer[] = [];
const cleanups: Array<() => unknown> = [];

afterEach(async () => {
  stage.removing = undefined;
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  await Promise.allSettled(servers.splice(0).map((server) => server.close()));
  await Promise.all(temporary.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const normalize = (value: string) => path.resolve(value).replace(/\\/g, '/');
const within = (target: string, root: string) =>
  normalize(target) === root || normalize(target).startsWith(`${root}/`);

async function directory(): Promise<string> {
  const runtime = path.join(import.meta.dirname, '.runtime');
  await mkdir(runtime, { recursive: true });
  const root = realpathSync(await mkdtemp(path.join(runtime, 'ng-doc-watch-scope-')));
  temporary.push(root);
  return root;
}

interface Fixture {
  /** Test-owned directory that contains the workspace: outside the workspace, above it. */
  parent: string;
  root: string;
  docs: string;
  output: string;
  cache: string;
  config: string;
  tsconfig: string;
  guide: string;
  include: string;
  api: string;
  app: string;
  log: string;
}

/**
 * An apps/ng-doc-like workspace: a guide page whose body includes a shared snippet, an API scope
 * over a TypeScript source, the tsconfig program, and a configuration file; the generator records
 * the formatting configuration lookups in every directory up to the filesystem root.
 */
async function workspace(): Promise<Fixture> {
  const parent = await directory();
  const root = path.join(parent, 'ws');
  const docs = path.join(root, 'docs');
  const fixture: Fixture = {
    parent,
    root,
    docs,
    output: path.join(root, 'generated'),
    cache: path.join(root, 'cache'),
    config: path.join(root, 'ng-doc.config.mjs'),
    tsconfig: path.join(root, 'tsconfig.json'),
    guide: path.join(docs, 'guide/guide.md'),
    include: path.join(docs, 'shared/snippet.md'),
    api: path.join(root, 'src/api/unique.ts'),
    app: path.join(root, 'src/app.component.ts'),
    log: path.join(parent, 'compiles.jsonl'),
  };
  await mkdir(path.dirname(fixture.guide), { recursive: true });
  await mkdir(path.dirname(fixture.include), { recursive: true });
  await mkdir(path.dirname(fixture.api), { recursive: true });
  await symlink(path.join(repository, 'node_modules'), path.join(root, 'node_modules'), 'dir');
  await writeFile(
    fixture.config,
    "export default { docsPath: 'docs', tsConfig: 'tsconfig.json', routePrefix: '', cache: true };\n",
  );
  await writeFile(
    fixture.tsconfig,
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'bundler',
        strict: true,
        experimentalDecorators: true,
        skipLibCheck: true,
        types: [],
      },
      include: ['docs/**/*.ts', 'src/**/*.ts'],
    }),
  );
  await writeFile(
    path.join(docs, 'guide/ng-doc.page.ts'),
    "const Guide = { title: 'Guide', route: 'guide', mdFile: './guide.md' };\nexport default Guide;\n",
  );
  await writeFile(
    fixture.guide,
    '# Guide\nGuide body marker.\n\n{% include "../shared/snippet.md" %}\n',
  );
  await writeFile(fixture.include, 'Shared snippet marker.\n');
  await writeFile(
    path.join(docs, 'ng-doc.api.ts'),
    "const api = { title: 'API', scopes: [{ name: 'fixture', route: 'fixture', include: 'src/api/**/*.ts' }] };\nexport default api;\n",
  );
  await writeFile(
    fixture.api,
    '/** Returns unique items, api marker. */\nexport function unique<T>(items: T[]): T[] {\n  return [...new Set(items)];\n}\n',
  );
  await writeFile(
    fixture.app,
    "import { Component } from '@angular/core';\n@Component({ selector: 'fixture-app', template: 'app' })\nexport class AppComponent {}\n",
  );
  return fixture;
}

/** The built compiler, wrapped to log every generation's changes and its recorded inputs. */
async function recordingCompiler(fixture: Fixture): Promise<string> {
  const wrapper = path.join(fixture.parent, 'recording-compiler.mjs');
  const base = path.join(repository, 'dist/libs/builder/generator/compiler/index.js');
  await writeFile(
    wrapper,
    `import { appendFileSync } from 'node:fs';
const real = await import(${JSON.stringify(pathToFileURL(base).href)});
const root = ${JSON.stringify(normalize(fixture.root))};
export async function createCompilationService(options) {
  const service = await real.createCompilationService(options);
  return {
    async compile(request, signal) {
      const result = await service.compile(request, signal);
      const recorded = result.dependencies.flatMap((item) =>
        item.kind === 'existence' || item.kind === 'content' ? [item.path] : []);
      appendFileSync(${JSON.stringify(fixture.log)}, JSON.stringify({
        generation: request.generation,
        paths: request.changes.map((item) => item.kind + ':' + item.path),
        outside: recorded.filter((file) => file !== root && !file.startsWith(root + '/')),
        errors: result.diagnostics.filter((item) => item.severity === 'error').map((item) => item.message),
      }) + '\\n');
      return result;
    },
    dispose: () => service.dispose(),
  };
}
`,
  );
  return wrapper;
}

interface CompileRecord {
  generation: number;
  paths: string[];
  outside: string[];
  errors: string[];
}

async function compiles(fixture: Fixture): Promise<CompileRecord[]> {
  if (!existsSync(fixture.log)) return [];
  return (await readFile(fixture.log, 'utf8'))
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as CompileRecord);
}

function fakeAngularPlugins(probe: string): Plugin[] {
  return [
    {
      name: '@analogjs/vite-plugin-angular',
      buildStart() {},
      // Analog returns nothing for a module it does not compile; Vite then keeps its modules.
      handleHotUpdate() {},
      transform: {
        filter: { id: /\.ts$/ },
        handler(_code: string, id: string) {
          if (path.resolve(id.replace(/\?.*$/, '')) !== path.resolve(probe)) return;
          return { code: 'export class AppComponent {}; AppComponent.ɵcmp = {};', map: null };
        },
      },
    },
    { name: 'fake-angular-companion' },
  ];
}

async function start(
  fixture: Fixture,
  plugins: Plugin[] = [],
  watch: { useFsEvents?: boolean; usePolling?: boolean } = {},
): Promise<ViteDevServer> {
  const server = await createServer({
    root: fixture.root,
    // Its own dependency cache (below a node_modules folder, as linters and editors skip): the
    // default one is shared by every fixture.
    cacheDir: path.join(fixture.root, '.vite/node_modules/.vite'),
    configFile: false,
    base: '/preview/',
    plugins: [
      ...plugins,
      createNgDocVitePlugin({
        analogLiveReload: true,
        angularPlugins: qualifyAngularPlugins(fakeAngularPlugins(fixture.app)),
        angularComponentProbe: fixture.app,
        generator: {
          projectId: 'watch-scope-fixture',
          workspaceRoot: fixture.root,
          configFile: fixture.config,
          defaults: {
            docsRoot: fixture.docs,
            tsConfig: fixture.tsconfig,
            outputRoot: fixture.output,
            cacheRoot: fixture.cache,
          },
          templateRoot: path.join(repository, 'dist/libs/builder/generator/templates'),
          worker: {
            moduleUrl: pathToFileURL(await recordingCompiler(fixture)),
            workerEntryUrl: pathToFileURL(
              path.join(repository, 'dist/libs/builder/generator/worker/entry.js'),
            ),
          },
          session: { batchDelayMs: 5 },
        },
      }),
    ],
    server: { host: '127.0.0.1', port: 0, watch },
    logLevel: 'silent',
  });
  servers.push(server);
  return server;
}

/** Records every path handed to the shared watcher once the server exists. */
function addRecorder(added: string[]): Plugin {
  return {
    name: 'watch-add-recorder',
    enforce: 'pre',
    configureServer(server: ViteDevServer) {
      const add = server.watcher.add.bind(server.watcher);
      server.watcher.add = ((paths: string | readonly string[]) => {
        added.push(...(typeof paths === 'string' ? [paths] : paths).map(normalize));
        return add(paths as string[]);
      }) as FSWatcher['add'];
    },
  };
}

/**
 * The native watch roots of this process: FSEvents stream roots (chokidar's macOS backend) and
 * `fs.watch` targets (its portable backend). Test-only instrumentation of the shared modules.
 */
function nativeRoots(): string[] {
  const roots: string[] = [];
  const fsevents = (() => {
    try {
      return createRequire(path.join(repository, 'node_modules/vite/dist/node/chunks/config.js'))(
        'fsevents',
      ) as { watch: (...args: unknown[]) => unknown };
    } catch {
      return undefined;
    }
  })();
  if (fsevents) {
    const watch = fsevents.watch;
    fsevents.watch = function (target: unknown, ...rest: unknown[]) {
      roots.push(normalize(String(target)));
      return Reflect.apply(watch, this, [target, ...rest]);
    };
    cleanups.push(() => {
      fsevents.watch = watch;
    });
  }
  const watch = fs.watch;
  (fs as { watch: unknown }).watch = function (target: unknown, ...rest: unknown[]) {
    roots.push(normalize(String(target)));
    return Reflect.apply(watch, fs, [target, ...rest]);
  };
  cleanups.push(() => {
    (fs as { watch: typeof fs.watch }).watch = watch;
  });
  return roots;
}

async function waitFor(
  check: () => Promise<boolean> | boolean,
  timeout: number = 20_000,
): Promise<void> {
  const deadline = Date.now() + timeout;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error('Timed out');
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

async function outputs(root: string, suffix: string): Promise<string[]> {
  const found: string[] = [];
  if (!existsSync(root)) return found;
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const file = path.join(root, entry.name);
    if (entry.isDirectory()) found.push(...(await outputs(file, suffix)));
    else if (entry.name.endsWith(suffix)) found.push(file);
  }
  return found.sort();
}

describe('watch scope: native watch roots stay inside the workspace', () => {
  it.each([
    ['the default backend (FSEvents on macOS)', {}],
    ['the fs.watch backend', { useFsEvents: false, usePolling: false }],
  ])(
    'watches the workspace natively and polls the lookups above it, with %s',
    async (_name, watch) => {
      const fixture = await workspace();
      const roots = nativeRoots();
      const added: string[] = [];
      const server = await start(fixture, [addRecorder(added)], watch);
      const workspaceRoot = normalize(fixture.root);
      const [initial] = await compiles(fixture);
      expect(initial?.errors).toEqual([]);
      // Not vacuous: the generator records lookups above the workspace, up to the filesystem root.
      expect(initial?.outside).toEqual(
        expect.arrayContaining([
          normalize(path.join(fixture.parent, '.editorconfig')),
          normalize(path.join(fixture.parent, 'package.json')),
          '/.editorconfig',
          '/package.json',
        ]),
      );
      expect(added.length).toBeGreaterThan(0);
      expect(roots.length).toBeGreaterThan(0);
      const outside = (paths: string[]) =>
        [...new Set(paths.filter((file) => !within(file, workspaceRoot)))].sort();
      // No allowed exceptions: every native root and every added path is inside the workspace.
      expect({
        addedOutside: outside(added).length,
        rootsOutside: outside(roots).slice(0, 12),
      }).toEqual({ addedOutside: 0, rootsOutside: [] });
      await server.close();
    },
    60_000,
  );

  it('notices a lookup file created later above the workspace (polled) and inside it (native)', async () => {
    const fixture = await workspace();
    const server = await start(fixture);
    const initial = (await compiles(fixture)).length;
    expect(initial).toBeGreaterThan(0);
    const [first] = await compiles(fixture);
    const outside = normalize(path.join(fixture.parent, '.editorconfig'));
    const inside = normalize(path.join(fixture.root, '.prettierrc.json'));
    expect(first!.outside).toContain(outside);
    expect(existsSync(outside) || existsSync(inside)).toBe(false);
    // Let the startup settle: the next recorded generation must be the probe's.
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    const settled = (await compiles(fixture)).length;

    await writeFile(outside, 'root = true\n');
    await waitFor(
      async () =>
        (await compiles(fixture))
          .slice(settled)
          .some((record) => record.paths.includes(`create:${outside}`)),
      PROBE_DEADLINE_MS,
    );

    const next = (await compiles(fixture)).length;
    await writeFile(inside, '{}\n');
    await waitFor(async () =>
      (await compiles(fixture))
        .slice(next)
        .some((record) => record.paths.some((entry) => entry.endsWith(`:${inside}`))),
    );

    const changed = (await compiles(fixture)).length;
    await unlink(outside);
    await waitFor(
      async () =>
        (await compiles(fixture))
          .slice(changed)
          .some((record) => record.paths.includes(`delete:${outside}`)),
      PROBE_DEADLINE_MS,
    );
    await server.close();
  }, 90_000);
});

/** Collects every HMR message a browser client would receive. */
async function hmrClient(server: ViteDevServer): Promise<{
  messages: Array<{ type: string; triggeredBy?: string }>;
  close(): void;
}> {
  const address = server.httpServer?.address();
  if (!address || typeof address === 'string') throw new Error('Missing Vite address');
  const socket = new WebSocket(
    `ws://127.0.0.1:${address.port}/preview/?token=${server.config.webSocketToken}`,
    'vite-hmr',
  );
  const messages: Array<{ type: string; triggeredBy?: string }> = [];
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data)) as { type: string; triggeredBy?: string };
    if (message.type !== 'connected' && message.type !== 'ping') messages.push(message);
  });
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener('open', () => resolve(), { once: true });
    socket.addEventListener('error', () => reject(new Error('HMR socket failed')), { once: true });
  });
  return { messages, close: () => socket.close() };
}

/**
 * The committer replaces a published file by renaming it to a backup and then renaming the staged
 * file into place, so a concurrent read can briefly observe ENOENT: retry.
 */
async function settledRead<T>(read: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await read();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || attempt > 100) throw error;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
}

/** The browser's view of the page: every generated content module is loaded (and re-loaded). */
async function load(server: ViteDevServer, fixture: Fixture): Promise<number> {
  return settledRead(async () => {
    const modules = await outputs(fixture.output, '.mjs');
    for (const file of modules) {
      await server.environments.client.transformRequest(`/@fs${normalize(file)}`);
    }
    return modules.length;
  });
}

async function contains(fixture: Fixture, marker: string): Promise<boolean> {
  return settledRead(async () => {
    for (const file of await outputs(fixture.output, '.mjs')) {
      if ((await readFile(file, 'utf8')).includes(marker)) return true;
    }
    return false;
  });
}

/** No generation and no HMR message for `quiet` ms. */
async function quiescent(
  fixture: Fixture,
  messages: readonly unknown[],
  quiet: number = 1_500,
): Promise<void> {
  let key = '';
  let since = Date.now();
  const deadline = Date.now() + 30_000;
  for (;;) {
    const current = `${(await compiles(fixture)).length}/${messages.length}`;
    if (current !== key) {
      key = current;
      since = Date.now();
    } else if (Date.now() - since >= quiet) return;
    if (Date.now() > deadline) throw new Error('Did not settle');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

describe('watch scope: one browser reload per edit', () => {
  it('reloads once for a guide, an include and an API edit, and at most once per publication when superseded', async () => {
    const fixture = await workspace();
    const server = await start(fixture);
    await server.listen();
    const client = await hmrClient(server);
    cleanups.push(() => client.close());
    expect(await load(server, fixture)).toBeGreaterThan(0);
    await quiescent(fixture, client.messages);

    const reloadsFor = async (file: string, from: string, to: string) => {
      const before = client.messages.length;
      const text = await readFile(file, 'utf8');
      expect(text).toContain(from);
      await writeFile(file, text.replace(from, to));
      await waitFor(() => contains(fixture, to));
      await quiescent(fixture, client.messages);
      await load(server, fixture);
      await quiescent(fixture, client.messages);
      return client.messages.slice(before).filter((message) => message.type === 'full-reload');
    };

    // Each: exactly one reload, the adapter's (Vite's own carries `triggeredBy`).
    const describeReloads = (reloads: Array<{ type: string; triggeredBy?: string }>) => ({
      adapter: reloads.filter((message) => message.triggeredBy === undefined).length,
      native: reloads.filter((message) => message.triggeredBy !== undefined).length,
    });
    const observed: Record<string, { adapter: number; native: number }> = {};
    for (const [name, file, from, to] of [
      ['guide', fixture.guide, 'Guide body marker', 'Guide body edited'],
      ['include', fixture.include, 'Shared snippet marker', 'Shared snippet edited'],
      ['api', fixture.api, 'api marker', 'api edited'],
    ] as const) {
      observed[name] = describeReloads(await reloadsFor(file, from, to));
    }

    // Generation N commits the guide and is superseded while its stage is removed.
    const before = client.messages.length;
    const generations = (await compiles(fixture)).length;
    let raced = false;
    stage.removing = async () => {
      raced = true;
      const changed = new Promise<void>((resolve) => {
        const listener = (file: string) => {
          if (normalize(file) !== normalize(fixture.guide)) return;
          server.watcher.off('change', listener);
          resolve();
        };
        server.watcher.on('change', listener);
      });
      const text = await readFile(fixture.guide, 'utf8');
      await writeFile(fixture.guide, text.replace('Guide body first', 'Guide body second'));
      await changed;
      // The session admits the edit (5 ms batch) and supersedes N before its commit returns.
      await new Promise((resolve) => setTimeout(resolve, 200));
    };
    const text = await readFile(fixture.guide, 'utf8');
    await writeFile(fixture.guide, text.replace('Guide body edited', 'Guide body first'));
    await waitFor(() => contains(fixture, 'Guide body second'));
    await quiescent(fixture, client.messages);
    await load(server, fixture);
    await quiescent(fixture, client.messages);
    expect(raced).toBe(true);
    expect((await compiles(fixture)).length).toBeGreaterThanOrEqual(generations + 2);
    const superseded = describeReloads(
      client.messages.slice(before).filter((message) => message.type === 'full-reload'),
    );
    expect(await contains(fixture, 'Guide body first')).toBe(false);
    // The contract allows a reload for N and for N+1, and requires at least the newest one.
    expect({
      ...observed,
      superseded: {
        adapter:
          superseded.adapter === 1 || superseded.adapter === 2
            ? 'N+1, maybe N'
            : superseded.adapter,
        native: superseded.native,
      },
    }).toEqual({
      guide: { adapter: 1, native: 0 },
      include: { adapter: 1, native: 0 },
      api: { adapter: 1, native: 0 },
      superseded: { adapter: 'N+1, maybe N', native: 0 },
    });
    await server.close();
  }, 120_000);
});
