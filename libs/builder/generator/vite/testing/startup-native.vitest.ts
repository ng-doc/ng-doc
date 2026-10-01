import { mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  type HmrContext,
  type HotUpdateOptions,
  type Plugin,
  type Rollup,
  type ViteDevServer,
  createLogger,
  createServer,
} from 'vite';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createNgDocVitePlugin } from '..';

const repository = path.resolve(import.meta.dirname, '../../../../..');
const temporary: string[] = [];
const servers: ViteDevServer[] = [];
afterEach(async () => {
  try {
    await Promise.all(servers.splice(0).map((server) => server.close()));
  } finally {
    await Promise.all(
      temporary.splice(0).map((root) => rm(root, { recursive: true, force: true })),
    );
    vi.unstubAllEnvs();
  }
}, 30_000);

describe('isolated native startup compilation coverage', () => {
  it('covers a real startup filesystem burst with the initial patched Angular pass, then compiles later edits', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('VITEST', undefined);
    const fixture = await project();
    const { createNgDocAngularPlugins } = await import(
      pathToFileURL(path.join(repository, 'dist/libs/builder/generator/vite/angular/index.js')).href
    );
    const angularPlugins: Plugin[] = createNgDocAngularPlugins({
      tsconfig: fixture.tsconfig,
      workspaceRoot: fixture.root,
    });
    const compiler = angularPlugins.find(
      (candidate) => candidate.name === '@analogjs/vite-plugin-angular',
    )!;
    const originalHot = compiler.handleHotUpdate as (context: any) => any;
    const originalBuild = compiler.buildStart as (...args: any[]) => any;
    let builds = 0;
    const calls: string[] = [];
    const failures: unknown[] = [];
    const completed: string[] = [];
    compiler.buildStart = async function (...args: [options: Rollup.NormalizedInputOptions]) {
      builds++;
      return originalBuild.apply(this, args);
    };
    compiler.handleHotUpdate = async function (context: HmrContext) {
      calls.push(context.file);
      try {
        return await originalHot.call(this, context);
      } catch (error) {
        failures.push(error);
        throw error;
      } finally {
        completed.push(context.file);
      }
    };
    const observed = new Set<string>();
    const finished = new Set<string>();
    let burst: string[] = [];
    const bytes = new Map<string, string>();
    const server = await createServer({
      root: fixture.root,
      // Its own dependency cache (below a node_modules folder, as linters and editors skip): the
      // default one is shared by every fixture.
      cacheDir: path.join(fixture.root, '.vite/node_modules/.vite'),
      configFile: false,
      logLevel: 'silent',
      plugins: [
        plugin(fixture, angularPlugins),
        {
          name: 'native-startup-burst',
          async configureServer(server: ViteDevServer) {
            const manifest = JSON.parse(
              await readFile(path.join(fixture.output, '.ng-doc-output-manifest.json'), 'utf8'),
            );
            burst = manifest.files
              .filter((file: { path: string }) => /\.[cm]?ts(?![a-z])/.test(file.path))
              .slice(0, 24)
              .map((file: { path: string }) => path.join(fixture.output, file.path));
            expect(burst.length).toBeGreaterThan(8);
            for (const file of burst) bytes.set(file, await readFile(file, 'utf8'));
            // The initial commit's own creation events may still be in flight when watch readiness
            // is reused without a generation. A rewrite coalesced with them is (correctly)
            // reported as a creation, so wait until the watcher knows every file first.
            const known = (file: string) =>
              (server.watcher.getWatched()[path.dirname(file)] ?? []).includes(path.basename(file));
            await waitFor(async () => burst.every(known));
            // Actual writes and native watcher events, before Vite invokes Angular buildStart.
            await Promise.all(burst.map((file) => writeFile(file, bytes.get(file)!)));
            await waitFor(async () => burst.every((file) => observed.has(file)));
            expect(builds).toBe(0);
          },
          hotUpdate: {
            order: 'pre',
            handler(context: HotUpdateOptions) {
              if (context.type === 'update') observed.add(context.file);
            },
          },
        },
        {
          name: 'native-startup-post',
          hotUpdate: {
            order: 'post',
            handler(context: HotUpdateOptions) {
              finished.add(context.file);
            },
          },
        },
      ],
      resolve: { alias: packageAliases(), dedupe: angularPackages() },
      server: { host: '127.0.0.1', port: 0 },
    });
    servers.push(server);
    await server.listen();
    await waitFor(async () => burst.every((file) => finished.has(file)));
    expect(builds).toBe(1);
    expect(calls.filter((file) => burst.includes(file))).toEqual([]);
    expect(failures).toEqual([]);
    const file = fixture.app;
    const appBytes = await readFile(file, 'utf8');
    await save(fixture, file, appBytes + '\nexport const startupTypeError: number = "invalid";\n');
    await waitFor(async () => failures.length > 0);
    expect(failures[0]).toMatchObject({ code: 'NGDOC_ANALOG_COMPILATION_DIAGNOSTIC' });
    await save(fixture, file, appBytes + '\n// repaired after readiness\n');
    // Its own update, not any other module's: a late report of a startup output may complete too.
    await waitFor(async () => completed.filter((candidate) => candidate === file).length > 1);
    expect(failures).toHaveLength(1);
    expect(calls.filter((candidate) => candidate === file)).toHaveLength(2);
  }, 90_000);
});

describe('one patched Angular pass per generation', () => {
  it('compiles the TypeScript outputs of a page title edit in one pass, serving what separate passes serve', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('VITEST', undefined);
    // One fixture for both arms, so generated identities and paths are the same.
    const fixture = await project();
    const shared = await pageTitleEdit(fixture, true);
    const separate = await pageTitleEdit(fixture, false);
    // The edit rewrites several generated TypeScript modules (page, routes, context).
    expect(shared.changed.length).toBeGreaterThanOrEqual(3);
    expect(separate.changed).toEqual(shared.changed);
    // Shared: one pass that takes the others as companions and confirms them.
    expect(shared.passes).toEqual([
      { file: expect.any(String), companions: shared.changed.length - 1, confirmed: true },
    ]);
    // Switch off: exactly one pass per report of a module, without companions, and every module
    // compiled. Not one per module: the switch restores the old behaviour, which compiles every
    // report, and under load FSEvents may report one committed write twice (the commit's write and
    // rename can arrive as two events); how often is the kernel's timing, not the host's.
    expect(separate.passes).toHaveLength(separate.reports);
    expect([...new Set(separate.passes.map((pass) => pass.file))].sort()).toEqual(separate.changed);
    expect(separate.passes.every((pass) => pass.companions === 0)).toBe(true);
    // Both serve the new title, byte for byte the same modules.
    expect(shared.served.get('routes.ts')).toContain('Retitled guide');
    expect(shared.served.get('context.ts')).toContain('Retitled guide');
    expect(shared.served).toEqual(separate.served);
  }, 180_000);
});

describe('the structural pass of a generation', () => {
  it('compiles the modules a generation creates in its own pass, serving what a filesystem pass serves', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('VITEST', undefined);
    const fixture = await project();
    // A page with two markdown tabs: a tab route edit moves the second tab's generated modules,
    // and no TypeScript source is added or deleted (only the markdown file changes).
    const guide = path.join(fixture.docs, 'guide');
    await mkdir(guide);
    await rm(path.join(fixture.docs, 'ng-doc.page.ts'));
    await writeFile(path.join(guide, 'guide.md'), '# Guide\nFirst tab body.\n');
    await writeFile(
      path.join(guide, 'second.md'),
      '---\ntitle: Second\nroute: second-tab\n---\n\nSecond tab body.\n',
    );
    await writeFile(
      path.join(guide, 'ng-doc.page.ts'),
      `const Guide = { title: 'Guide', route: 'guide', mdFile: ['./guide.md', './second.md'] };\nexport default Guide;\n`,
    );
    const claimed = await tabRouteEdit(fixture, true);
    const unclaimed = await tabRouteEdit(fixture, false);
    // The edit creates and deletes generated TypeScript modules and rewrites the shell.
    expect(claimed.created.length).toBeGreaterThan(0);
    expect(claimed.deleted.length).toBeGreaterThan(0);
    expect(unclaimed.created).toEqual(claimed.created);
    expect(unclaimed.deleted).toEqual(claimed.deleted);
    // On: Analog leaves those events to the generation's pass, which is the only one.
    expect(claimed.claimed).toEqual([...claimed.created, ...claimed.deleted].sort());
    expect(claimed.passes).toBe(1);
    // Off: Analog compiles the program on the events, and the generation's pass follows. Not an
    // exact count: upstream Analog debounces add and unlink events by 100 ms of wall-clock time,
    // so the events of one commit start one pass or several, as the watcher happens to deliver
    // them; nothing the host or the test controls orders them into one window.
    expect(unclaimed.claimed).toEqual([]);
    expect(unclaimed.passes).toBeGreaterThanOrEqual(2);
    // Both serve the moved tab, byte for byte the same modules.
    expect([...claimed.served.values()].join('\n')).toContain('moved-tab');
    expect(claimed.served).toEqual(unclaimed.served);
  }, 180_000);
});

describe('description modules and the structural pass', () => {
  // Each step waits for its own signal (the adapter's reload, a logged error, the served bytes);
  // a claimed event starts no pass, so the pass counts are exact once a reload is sent.
  it('claims new and deleted description modules, compiles a replaced existing one in its own pass, and compiles claimed ones in the next pass', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('VITEST', undefined);
    const fixture = await project();
    const guide = path.join(fixture.docs, 'guide');
    await mkdir(guide);
    await rm(path.join(fixture.docs, 'ng-doc.page.ts'));
    await rename(fixture.markdown, path.join(guide, 'guide.md'));
    await writeFile(
      path.join(guide, 'ng-doc.page.ts'),
      `const Guide = { title: 'Guide', route: 'guide', mdFile: './guide.md' };\nexport default Guide;\n`,
    );
    const { createNgDocAngularPlugins } = await import(
      pathToFileURL(path.join(repository, 'dist/libs/builder/generator/vite/angular/index.js')).href
    );
    const angularPlugins: Plugin[] = createNgDocAngularPlugins({
      tsconfig: fixture.tsconfig,
      workspaceRoot: fixture.root,
    });
    const compiler = angularPlugins.find(
      (candidate) => candidate.name === '@analogjs/vite-plugin-angular',
    );
    const hooks = compiler?.api.ngDocHost as {
      passes: number;
      claimFilesystemChange?: (file: string) => boolean;
    };
    const host = plugin(fixture, angularPlugins);
    const reports = countReports(host, (file) => /\.[cm]?ts$/.test(file));
    const claim = hooks.claimFilesystemChange!;
    const claimed: string[] = [];
    hooks.claimFilesystemChange = (file) => {
      const result = claim(file);
      if (result) claimed.push(path.relative(fixture.root, file));
      return result;
    };
    const errors: string[] = [];
    const logger = createLogger('silent');
    logger.error = (message: string) => void errors.push(message);
    let reloads = 0;
    const server = await createServer({
      root: fixture.root,
      // Its own dependency cache (below a node_modules folder, as linters and editors skip): the
      // default one is shared by every fixture.
      cacheDir: path.join(fixture.root, '.vite/node_modules/.vite'),
      configFile: false,
      customLogger: logger,
      logLevel: 'silent',
      plugins: [
        host,
        {
          name: 'description-module-observer',
          configureServer(value: ViteDevServer) {
            const send = value.ws.send.bind(value.ws) as (...args: any[]) => void;
            value.ws.send = ((...args: any[]) => {
              if (args[0]?.type === 'full-reload') reloads++;
              send(...args);
            }) as typeof value.ws.send;
          },
        },
      ],
      resolve: { alias: packageAliases(), dedupe: angularPackages() },
      server: { host: '127.0.0.1', port: 0 },
    });
    servers.push(server);
    await server.listen();
    const client = server.environments.client;
    /**
     * What Vite serves for `file` with no cached transform of its own.
     * @param file An absolute path.
     */
    const served = async (file: string) => {
      for (const node of client.moduleGraph.getModulesByFile(file) ?? [])
        client.moduleGraph.invalidateModule(node);
      return (await client.transformRequest(`/@fs${file}`))?.code ?? '';
    };
    const generated = (file: string) => served(path.join(fixture.output, file));
    /**
     * Makes a change and waits for the adapter's reload or a logged error, and until every
     * TypeScript report the compiler hook received is handled.
     * @param change The change.
     */
    const settle = async (change: () => Promise<void>) => {
      const [reloaded, failed] = [reloads, errors.length];
      await change();
      await waitFor(async () => reloads > reloaded || errors.length > failed, 60_000);
      await waitFor(async () => reports.handled === reports.received, 60_000);
    };
    // Every change lands at once, as an editor's save does. Staged outside the Vite root, whose
    // watcher would report the staged TypeScript files to Analog.
    const staging = `${fixture.root}-staging`;
    temporary.push(staging);
    let staged = 0;
    const stage = async (files: Record<string, string>) => {
      const folder = path.join(staging, String(++staged));
      for (const [file, text] of Object.entries(files)) {
        await mkdir(path.dirname(path.join(folder, file)), { recursive: true });
        await writeFile(path.join(folder, file), text);
      }
      return folder;
    };
    const pageModule = (title: string, route: string, extra = '') =>
      `const page = { title: '${title}', route: '${route}', mdFile: './index.md' };\nexport default page;\n${extra}`;
    await generated('routes.ts');

    // A new page: its description module and generated modules join the generation's one pass.
    const probe = path.join(fixture.docs, 'probe');
    let passes = hooks.passes;
    const added = await stage({
      'index.md': '# Probe\nProbe body.\n',
      'ng-doc.page.ts': pageModule('Probe', 'probe', "export const marker = 'probe v1';\n"),
    });
    await settle(() => rename(added, probe));
    expect(errors).toEqual([]);
    expect(claimed).toContain('docs/probe/ng-doc.page.ts');
    expect(hooks.passes - passes).toBe(1);
    expect(await generated('routes.ts')).toContain('guides/probe/page.ts');
    expect(await generated('guides/probe/page.ts')).toContain('ɵɵdefineComponent');
    expect(await served(path.join(probe, 'ng-doc.page.ts'))).toContain('probe v1');

    // A new page whose generation fails: claimed, and compiled by no pass of its own. Once its
    // markdown exists, the generation's pass (no TypeScript source changed) compiles it.
    const broken = path.join(fixture.docs, 'broken');
    passes = hooks.passes;
    const failing = await stage({
      'ng-doc.page.ts': pageModule('Broken', 'broken', "export const marker = 'broken v1';\n"),
    });
    await settle(() => rename(failing, broken));
    expect(errors.length).toBeGreaterThan(0);
    expect(claimed).toContain('docs/broken/ng-doc.page.ts');
    expect(hooks.passes - passes).toBe(0);
    errors.length = 0;
    await settle(() => save(fixture, path.join(broken, 'index.md'), '# Broken\nRepaired.\n'));
    expect(errors).toEqual([]);
    expect(hooks.passes - passes).toBe(1);
    expect(await generated('guides/broken/page.ts')).toContain('ɵɵdefineComponent');
    expect(await served(path.join(broken, 'ng-doc.page.ts'))).toContain('broken v1');

    // A category no page belongs to yet: claimed, and its generation rewrites no TypeScript
    // module, so no pass runs. The next pass (a page joining it) compiles it.
    const category = path.join(fixture.docs, 'section/ng-doc.category.ts');
    passes = hooks.passes;
    const section = await stage({
      'ng-doc.category.ts':
        "const category = { title: 'Section', route: 'section' };\nexport default category;\nexport const marker = 'section v1';\n",
    });
    await settle(() => rename(section, path.dirname(category)));
    expect(errors).toEqual([]);
    expect(claimed).toContain('docs/section/ng-doc.category.ts');
    expect(hooks.passes - passes).toBe(0);
    await settle(() =>
      save(
        fixture,
        path.join(broken, 'ng-doc.page.ts'),
        "import Section from '../section/ng-doc.category';\n" +
          pageModule('Broken', 'broken', "export const marker = 'broken v2';\n").replace(
            "mdFile: './index.md'",
            "mdFile: './index.md', category: Section",
          ),
      ),
    );
    expect(errors).toEqual([]);
    expect(await generated('routes.ts')).toContain("path: 'section'");
    expect(await served(category)).toContain('section v1');
    expect(await served(path.join(broken, 'ng-doc.page.ts'))).toContain('broken v2');

    // An existing page's description module replaced with only an add event (an editor's atomic
    // save, a checkout): the committed generation read it, and its page shell imports it. The new
    // bytes change no generated module, so only the module's own pass compiles them.
    const existing = path.join(probe, 'ng-doc.page.ts');
    const claims = claimed.length;
    server.watcher.unwatch(existing);
    await writeFile(existing, pageModule('Probe', 'probe', "export const marker = 'probe v2';\n"));
    passes = hooks.passes;
    await settle(async () => {
      server.watcher.emit('add', existing);
      expect(claimed.length).toBe(claims);
    });
    expect(errors).toEqual([]);
    await waitFor(async () => (await served(existing)).includes('probe v2'), 60_000);
    expect(hooks.passes).toBeGreaterThan(passes);

    // A deleted page: its description module is claimed, and the generation's pass drops it.
    passes = hooks.passes;
    await settle(() => rm(broken, { recursive: true }));
    expect(errors).toEqual([]);
    expect(claimed).toContain('docs/broken/ng-doc.page.ts');
    expect(await generated('routes.ts')).not.toContain('guides/broken/page.ts');
    expect(hooks.passes - passes).toBe(1);
  }, 240_000);
});

/**
 * Counts the generated TypeScript updates the composed Angular compiler hook receives while
 * `counting()` holds, and how many of them it has finished handling (with a pass of their own, or
 * acknowledged as covered by one). A watcher under load may report one write more than once.
 * @param host The NgDoc plugins, whose Angular compiler hook is the composed one.
 * @param counted Whether a file is counted.
 */
function countReports(host: Plugin[], counted: (file: string) => boolean) {
  const composed = host.find((candidate) => candidate.name === '@analogjs/vite-plugin-angular')!;
  const hook = composed.handleHotUpdate as any;
  const inner = (typeof hook === 'function' ? hook : hook.handler) as (context: HmrContext) => any;
  const reports = { received: 0, handled: 0 };
  const wrapped = async function (this: unknown, context: HmrContext) {
    const tracked = counted(context.file);
    if (tracked) reports.received++;
    try {
      return await inner.call(this, context);
    } finally {
      if (tracked) reports.handled++;
    }
  };
  composed.handleHotUpdate = (
    typeof hook === 'function' ? wrapped : { ...hook, handler: wrapped }
  ) as Plugin['handleHotUpdate'];
  return reports;
}

/**
 * Starts the patched host, moves the second tab through its front matter route, waits for the
 * adapter's reload, for every report of a generated module to be handled and (when nothing is
 * claimed) for Analog's filesystem pass, and returns the generated TypeScript modules the edit
 * created and deleted, the ones the compiler claimed, the passes it ran, and the code Vite then
 * serves for each changed or created module. Restores the tab before closing the server.
 * @param fixture The workspace, with a page of two tabs.
 * @param structuralPass Whether `NGDOC_ANGULAR_STRUCTURAL_PASS` is on.
 */
async function tabRouteEdit(fixture: Fixture, structuralPass: boolean) {
  vi.stubEnv('NGDOC_ANGULAR_STRUCTURAL_PASS', structuralPass ? undefined : '0');
  const { createNgDocAngularPlugins } = await import(
    pathToFileURL(path.join(repository, 'dist/libs/builder/generator/vite/angular/index.js')).href
  );
  const angularPlugins: Plugin[] = createNgDocAngularPlugins({
    tsconfig: fixture.tsconfig,
    workspaceRoot: fixture.root,
  });
  const compiler = angularPlugins.find(
    (candidate) => candidate.name === '@analogjs/vite-plugin-angular',
  );
  const hooks = compiler?.api.ngDocHost as {
    passes: number;
    claimFilesystemChange?: (file: string) => boolean;
  };
  const host = plugin(fixture, angularPlugins);
  let editing = false;
  const reports = countReports(
    host,
    (file) => editing && file.startsWith(fixture.output) && /\.ts$/.test(file),
  );
  const claimed: string[] = [];
  const claim = hooks.claimFilesystemChange;
  expect(claim === undefined).toBe(!structuralPass);
  if (claim)
    hooks.claimFilesystemChange = (file) => {
      const result = claim(file);
      if (editing && result) claimed.push(path.relative(fixture.output, file));
      return result;
    };
  const created = new Set<string>();
  const deleted = new Set<string>();
  const changed = new Set<string>();
  let reloads = 0;
  let allReloads = 0;
  const server = await createServer({
    root: fixture.root,
    // Its own dependency cache (below a node_modules folder, as linters and editors skip): the
    // default one is shared by every fixture.
    cacheDir: path.join(fixture.root, '.vite/node_modules/.vite'),
    configFile: false,
    logLevel: 'silent',
    plugins: [
      host,
      {
        name: 'tab-edit-observer',
        configureServer(value: ViteDevServer) {
          const send = value.ws.send.bind(value.ws) as (...args: any[]) => void;
          value.ws.send = ((...args: any[]) => {
            if (args[0]?.type === 'full-reload') {
              allReloads++;
              if (editing) reloads++;
            }
            send(...args);
          }) as typeof value.ws.send;
          const record = (into: Set<string>) => (file: string) => {
            if (editing && file.startsWith(fixture.output) && /(?<!\.d)\.ts$/.test(file))
              into.add(path.relative(fixture.output, file));
          };
          value.watcher.on('add', record(created));
          value.watcher.on('unlink', record(deleted));
          value.watcher.on('change', record(changed));
        },
      },
    ],
    resolve: { alias: packageAliases(), dedupe: angularPackages() },
    server: { host: '127.0.0.1', port: 0 },
  });
  servers.push(server);
  await server.listen();
  const client = server.environments.client;
  const manifest = JSON.parse(
    await readFile(path.join(fixture.output, '.ng-doc-output-manifest.json'), 'utf8'),
  );
  const modules = (manifest.files as Array<{ path: string }>)
    .map((file) => file.path)
    .filter((file) => /\.ts$/.test(file));
  const url = (file: string) => `/@fs${path.join(fixture.output, file)}`;
  for (const file of modules) await client.transformRequest(url(file));
  const second = path.join(fixture.docs, 'guide/second.md');
  const before = await readFile(second, 'utf8');
  const passes = hooks.passes;
  editing = true;
  await save(fixture, second, '---\ntitle: Second\nroute: moved-tab\n---\n\nSecond tab body.\n');
  await waitFor(async () => reloads > 0, 60_000);
  // The reload follows every created and deleted module's report, so each add and unlink event
  // has reached Analog: claimed (no pass), or scheduling a pass the reload does not wait for. That
  // one may coalesce events or not, as their timing goes, so it is awaited, not counted.
  await waitFor(
    async () =>
      reports.handled === reports.received && (structuralPass || hooks.passes - passes >= 2),
    60_000,
  );
  const passCount = hooks.passes - passes;
  const served = new Map<string, string>();
  const normalize = (code: string) =>
    code.replace(/([?&])t=\d+/g, '$1t=<t>').replace(/([?&])v=[0-9a-f]+/g, '$1v=<v>');
  for (const file of [...new Set([...changed, ...created])].sort()) {
    const id = path.join(fixture.output, file);
    for (const node of client.moduleGraph.getModulesByFile(id) ?? [])
      client.moduleGraph.invalidateModule(node);
    const result = await client.transformRequest(url(file));
    served.set(file, normalize(result?.code ?? ''));
  }
  editing = false;
  const result = {
    created: [...created].sort(),
    deleted: [...deleted].sort(),
    claimed: claimed.filter((file) => /(?<!\.d)\.ts$/.test(file)).sort(),
    passes: passCount,
    served,
  };
  // Restored while this server runs, so the next one starts on an unchanged output (a startup
  // commit's late events would otherwise reach its edit).
  const restored = allReloads;
  await save(fixture, second, before);
  await waitFor(async () => allReloads > restored, 60_000);
  await server.close();
  servers.splice(servers.indexOf(server), 1);
  return result;
}

/**
 * Starts the patched host, retitles the page, waits for the adapter's reload and for every report
 * of a generated module to be handled, and returns the generated TypeScript modules the edit
 * changed, the compiler passes their updates took, the number of their reports, and the code Vite
 * then serves for each of them (timestamps and optimizer hashes normalized). Restores the title
 * before closing the server.
 */
async function pageTitleEdit(fixture: Fixture, sharedPass: boolean) {
  vi.stubEnv('NGDOC_ANGULAR_SHARED_PASS', sharedPass ? undefined : '0');
  const { createNgDocAngularPlugins } = await import(
    pathToFileURL(path.join(repository, 'dist/libs/builder/generator/vite/angular/index.js')).href
  );
  const angularPlugins: Plugin[] = createNgDocAngularPlugins({
    tsconfig: fixture.tsconfig,
    workspaceRoot: fixture.root,
  });
  const compiler = angularPlugins.find(
    (candidate) => candidate.name === '@analogjs/vite-plugin-angular',
  )!;
  const originalHot = compiler.handleHotUpdate as (context: any) => any;
  let editing = false;
  const passes: Array<{ file: string; companions: number; confirmed: boolean }> = [];
  compiler.handleHotUpdate = async function (context: HmrContext & Record<string, any>) {
    const result = await originalHot.call(this, context);
    if (editing && context.file.startsWith(fixture.output) && /\.ts$/.test(context.file)) {
      passes.push({
        file: path.relative(fixture.output, context.file),
        companions: context.ngDocCompanionFiles?.length ?? 0,
        confirmed: context.ngDocCompanionPass !== undefined,
      });
    }
    return result;
  };
  const changed = new Set<string>();
  let reloads = 0;
  let allReloads = 0;
  const host = plugin(fixture, angularPlugins);
  const reports = countReports(
    host,
    (file) => editing && file.startsWith(fixture.output) && /\.ts$/.test(file),
  );
  const server = await createServer({
    root: fixture.root,
    // Its own dependency cache (below a node_modules folder, as linters and editors skip): the
    // default one is shared by every fixture.
    cacheDir: path.join(fixture.root, '.vite/node_modules/.vite'),
    configFile: false,
    logLevel: 'silent',
    plugins: [
      host,
      {
        name: 'page-edit-observer',
        configureServer(value: ViteDevServer) {
          const send = value.ws.send.bind(value.ws) as (...args: any[]) => void;
          value.ws.send = ((...args: any[]) => {
            if (args[0]?.type === 'full-reload') {
              allReloads++;
              if (editing) reloads++;
            }
            send(...args);
          }) as typeof value.ws.send;
        },
        hotUpdate: {
          order: 'pre',
          handler(context: HotUpdateOptions) {
            if (
              editing &&
              this.environment.name === 'client' &&
              context.type === 'update' &&
              context.file.startsWith(fixture.output) &&
              /\.ts$/.test(context.file)
            ) {
              changed.add(path.relative(fixture.output, context.file));
            }
          },
        },
      },
    ],
    resolve: { alias: packageAliases(), dedupe: angularPackages() },
    server: { host: '127.0.0.1', port: 0 },
  });
  servers.push(server);
  await server.listen();
  const client = server.environments.client;
  // Every generated module is in the module graph before the edit, as in a loaded page.
  const manifest = JSON.parse(
    await readFile(path.join(fixture.output, '.ng-doc-output-manifest.json'), 'utf8'),
  );
  const modules = (manifest.files as Array<{ path: string }>)
    .map((file) => file.path)
    .filter((file) => /\.ts$/.test(file));
  const url = (file: string) => `/@fs${path.join(fixture.output, file)}`;
  for (const file of modules) await client.transformRequest(url(file));
  const page = path.join(fixture.docs, 'ng-doc.page.ts');
  const before = await readFile(page, 'utf8');
  editing = true;
  await save(fixture, page, before.replace("title: 'Guide'", "title: 'Retitled guide'"));
  // The adapter reloads only after every changed module's update acknowledged its pass. A report
  // the watcher repeated after it is handled too, before anything is counted.
  await waitFor(async () => reloads > 0, 60_000);
  await waitFor(async () => reports.handled === reports.received, 60_000);
  const counted = { passes: [...passes], reports: reports.received };
  const served = new Map<string, string>();
  // Each server has its own update timestamps and dependency optimization.
  const normalize = (code: string) =>
    code.replace(/([?&])t=\d+/g, '$1t=<t>').replace(/([?&])v=[0-9a-f]+/g, '$1v=<v>');
  for (const file of [...changed].sort()) {
    const id = path.join(fixture.output, file);
    for (const node of client.moduleGraph.getModulesByFile(id) ?? [])
      client.moduleGraph.invalidateModule(node);
    const result = await client.transformRequest(url(file));
    served.set(file, normalize(result?.code ?? ''));
  }
  editing = false;
  // Restored while this server runs, so the next one starts on an unchanged output (a startup
  // commit's late events would otherwise reach its edit).
  const restored = allReloads;
  await save(fixture, page, before);
  await waitFor(async () => allReloads > restored, 60_000);
  await server.close();
  servers.splice(servers.indexOf(server), 1);
  return { changed: [...changed].sort(), ...counted, served };
}

let saves = 0;

/**
 * Writes `file` in one step, as an editor's atomic save does: staged beside the workspace (outside
 * the Vite root) and renamed over it. The host runs in this process, so a compiler pass that holds
 * its thread between the truncation and the write of a plain `writeFile` would let a generation or
 * a pass read the file half written.
 * @param fixture The workspace.
 * @param file The file.
 * @param text Its new content.
 */
async function save(fixture: Fixture, file: string, text: string): Promise<void> {
  const folder = `${fixture.root}-saves`;
  if (!temporary.includes(folder)) temporary.push(folder);
  await mkdir(folder, { recursive: true });
  const staged = path.join(folder, String(++saves));
  await writeFile(staged, text);
  await rename(staged, file);
}

interface Fixture {
  root: string;
  docs: string;
  output: string;
  cache: string;
  config: string;
  tsconfig: string;
  markdown: string;
  app: string;
  appTemplate: string;
}

async function directory(): Promise<string> {
  const runtime = path.join(import.meta.dirname, '.runtime');
  await mkdir(runtime, { recursive: true });
  const root = await mkdtemp(path.join(runtime, 'ng-doc-vite-'));
  temporary.push(root);
  return root;
}

async function project(): Promise<Fixture> {
  const root = await directory();
  const docs = path.join(root, 'docs');
  const output = path.join(root, 'generated');
  const cache = path.join(root, 'cache');
  const config = path.join(root, 'ng-doc.config.mjs');
  const tsconfig = path.join(root, 'tsconfig.json');
  const markdown = path.join(docs, 'guide.md');
  const app = path.join(root, 'src/app.component.ts');
  const appTemplate = path.join(root, 'src/app.component.html');
  await mkdir(docs, { recursive: true });
  await symlink(path.join(repository, 'node_modules'), path.join(root, 'node_modules'), 'dir');
  await writeFile(path.join(root, '.editorconfig'), 'root = true\n');
  await writeConfiguration(config);
  await writeFile(
    tsconfig,
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'bundler',
        strict: true,
        experimentalDecorators: true,
        skipLibCheck: true,
        types: [],
        baseUrl: root,
        paths: {
          '@ng-doc/generated': [path.join(output, 'index.ts')],
          '@ng-doc/app': [path.join(repository, 'libs/app/index.ts')],
          '@ng-doc/app/*': [path.join(repository, 'libs/app/*')],
          '@ng-doc/core': [path.join(repository, 'libs/core/index.ts')],
          '@ng-doc/core/*': [path.join(repository, 'libs/core/*')],
          '@ng-doc/ui-kit': [path.join(repository, 'libs/ui-kit/index.ts')],
          '@ng-doc/ui-kit/*': [path.join(repository, 'libs/ui-kit/*')],
        },
      },
      angularCompilerOptions: { strictTemplates: true, strictInjectionParameters: true },
      include: ['docs/**/*.ts', 'src/**/*.ts', 'generated/**/*.ts'],
    }),
  );
  await writeFile(
    path.join(docs, 'ng-doc.page.ts'),
    `const Guide = { title: 'Guide', route: 'guide', mdFile: './guide.md' };\nexport default Guide;\n`,
  );
  await writeFile(markdown, '# Guide\nInitial native Vite body with searchable text.\n');
  await mkdir(path.join(root, 'src'), { recursive: true });
  await writeFile(
    app,
    `import { Component } from '@angular/core';\n@Component({ selector: 'fixture-app', templateUrl: './app.component.html' })\nexport class AppComponent {}\n`,
  );
  await writeFile(appTemplate, 'initial external resource marker');
  await writeFile(
    path.join(root, 'src/main.ts'),
    `import { NG_DOC_ROUTING } from '@ng-doc/generated';\ndocument.body.dataset.routes = String(NG_DOC_ROUTING.length);\n`,
  );
  await writeFile(
    path.join(root, 'index.html'),
    '<html><head></head><body>fixture<script type="module" src="/src/main.ts"></script></body></html>',
  );
  return { root, docs, output, cache, config, tsconfig, markdown, app, appTemplate };
}

async function writeConfiguration(file: string, outDir?: string): Promise<void> {
  await writeFile(
    file,
    `export default { docsPath: 'docs', tsConfig: 'tsconfig.json', routePrefix: '', cache: true${outDir ? `, outDir: ${JSON.stringify(outDir)}` : ''} };\n`,
  );
}

function plugin(fixture: Fixture, angularPlugins: Plugin[]) {
  return createNgDocVitePlugin({
    analogLiveReload: true,
    angularPlugins,
    angularComponentProbe: fixture.app,
    generator: {
      projectId: 'vite-fixture',
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
        moduleUrl: pathToFileURL(
          path.join(repository, 'dist/libs/builder/generator/compiler/index.js'),
        ),
        workerEntryUrl: pathToFileURL(
          path.join(repository, 'dist/libs/builder/generator/worker/entry.js'),
        ),
      },
      session: { batchDelayMs: 5 },
    },
  });
}

function packageAliases() {
  return ['app', 'core', 'ui-kit'].map((name) => ({
    find: `@ng-doc/${name}`,
    replacement: path.join(repository, `libs/${name}`),
  }));
}

function angularPackages(): string[] {
  return [
    '@angular/core',
    '@angular/common',
    '@angular/compiler',
    '@angular/platform-browser',
    '@angular/router',
    'rxjs',
  ];
}

async function waitFor(predicate: () => Promise<boolean>, timeout: number = 20_000): Promise<void> {
  const deadline = Date.now() + timeout;
  while (!(await predicate())) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for native Vite update');
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}
