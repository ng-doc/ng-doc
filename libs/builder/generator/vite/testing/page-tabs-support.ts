/**
 * The real Vite/Analog host fixture of the structural edit suites (`page-tabs.vitest.ts`,
 * `page-tabs-structural.vitest.ts`): split in two files so that they run in separate shards.
 */
import { readFileSync } from 'node:fs';
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { type Logger, type Plugin, type ViteDevServer, createLogger, createServer } from 'vite';
import { expect, vi } from 'vitest';

import { createGeneratorBuildSession } from '../../bootstrap';
import { createNgDocVitePlugin } from '..';

const repository = path.resolve(import.meta.dirname, '../../../../..');
const generatorDist = path.join(repository, 'dist/libs/builder/generator');
const temporary: string[] = [];
const servers: ViteDevServer[] = [];
/** Closes every server and removes every fixture a test started; each test file runs it after each test. */
export async function cleanup(): Promise<void> {
  try {
    await Promise.all(servers.splice(0).map((server) => server.close()));
  } finally {
    await Promise.all(
      temporary.splice(0).map((root) => rm(root, { recursive: true, force: true })),
    );
    vi.unstubAllEnvs();
  }
}

export interface Fixture {
  root: string;
  docs: string;
  output: string;
  cache: string;
  config: string;
  tsconfig: string;
  appTsconfig: string;
  app: string;
}

let saves = 0;

/**
 * Writes `file` in one step, as an editor's atomic save does: the file is staged beside the docs
 * (outside every watched root) and renamed over it. The host runs in this process, so a compiler
 * pass that holds its thread between the truncation and the write of a plain `writeFile` would let
 * a generation read the file half written.
 * @param fixture The workspace.
 * @param file The file.
 * @param text Its new content.
 */
export async function save(fixture: Fixture, file: string, text: string): Promise<void> {
  const staged = path.join(fixture.root, 'saves', String(++saves));
  await mkdir(path.dirname(staged), { recursive: true });
  await writeFile(staged, text);
  await rename(staged, file);
}

export const pageModule = (title: string, route: string, extra = '') =>
  `const page = { title: '${title}', route: '${route}', mdFile: './index.md'${extra} };\nexport default page;\n`;

/**
 * Starts the real Vite/Analog development host on the fixture, with every generated TypeScript
 * module loaded as a browser would. `edit` makes a change and waits for the adapter's reload, and
 * fails on any host error (such as `NGDOC_VITE_HOST_TIMEOUT`) logged meanwhile.
 * @param fixture The workspace.
 * @param options With `open: false`, no generated module is ever requested, as for pages nobody
 *   opened.
 * @param options.open
 */
export async function startHost(fixture: Fixture, options: { open?: boolean } = {}) {
  const open = options.open !== false;
  const { createNgDocAngularPlugins } = await import(
    pathToFileURL(path.join(generatorDist, 'vite/angular/index.js')).href
  );
  const angularPlugins: Plugin[] = createNgDocAngularPlugins({
    tsconfig: fixture.appTsconfig,
    workspaceRoot: fixture.root,
  });
  const errors: string[] = [];
  const logger: Logger = createLogger('silent');
  logger.error = (message: string) => void errors.push(message);
  let reloads = 0;
  /** The committed generation when each reload was sent (the adapter reloads for the newest). */
  const reloadGenerations: number[] = [];
  const server = await createServer({
    // As in the documentation site: the output root lies outside the Vite root, so Vite watches
    // a generated module only once it has served it.
    root: path.join(fixture.root, 'src'),
    // Its own dependency cache (below a node_modules folder, as linters and editors skip): the
    // default one is shared by every fixture.
    cacheDir: path.join(fixture.root, '.vite/node_modules/.vite'),
    configFile: false,
    customLogger: logger,
    logLevel: 'silent',
    plugins: [
      plugin(fixture, angularPlugins),
      {
        name: 'page-tabs-observer',
        configureServer(value: ViteDevServer) {
          const send = value.ws.send.bind(value.ws) as (...args: any[]) => void;
          value.ws.send = ((...args: any[]) => {
            if (args[0]?.type === 'full-reload') {
              reloads++;
              reloadGenerations.push(committedManifest(fixture.output)?.generation ?? -1);
            }
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
  const url = (file: string) => `/@fs${path.join(fixture.output, file)}`;
  // Timestamps and optimizer hashes differ per load.
  const normalize = (code: string) =>
    code.replace(/([?&])t=\d+/g, '$1t=<t>').replace(/([?&])v=[0-9a-f]+/g, '$1v=<v>');
  const load = async () => {
    for (const file of await generatedModules(fixture.output)) {
      await client.transformRequest(url(file));
    }
  };
  if (open) await load();
  return {
    errors: () => [...errors],
    async edit(change: () => Promise<void>) {
      const before = reloads;
      await change();
      await waitFor(async () => reloads > before || errors.length > 0, 90_000);
      expect(errors).toEqual([]);
      // What a reloaded browser requests, including modules this edit created.
      if (open) await load();
    },
    /**
     * Saves `file` in place, as VS Code does (truncated, then written), and waits until the host
     * committed what a cold build of the final bytes commits and reloaded for that generation. A
     * generation may read the empty file in between; the watch must still settle on the final one.
     * @param file A markdown file (an empty one is valid content).
     * @param text Its new content.
     */
    async saveInPlace(file: string, text: string) {
      await writeFile(file, '');
      await writeFile(file, text);
      const cold = await coldBuild(fixture);
      const expected = manifestFiles(committedManifest(cold));
      await rm(cold, { recursive: true, force: true });
      let generation = -1;
      await waitFor(async () => {
        const manifest = committedManifest(fixture.output);
        if (errors.length > 0) return true;
        if (!manifest || JSON.stringify(manifestFiles(manifest)) !== JSON.stringify(expected))
          return false;
        generation = manifest.generation;
        return true;
      }, 90_000);
      expect(errors).toEqual([]);
      await waitFor(
        async () => reloadGenerations.some((value) => value >= generation) || errors.length > 0,
        90_000,
      );
      expect(errors).toEqual([]);
      if (open) await load();
    },
    /**
     * The module Vite serves now, without invalidating anything itself.
     * @param file
     */
    async served(file: string) {
      return normalize((await client.transformRequest(url(file)))?.code ?? '');
    },
    /** Every generated module as served, and as served after dropping every cached transform. */
    async servedTwice() {
      const files = await generatedModules(fixture.output);
      const current = new Map<string, string>();
      for (const file of files) current.set(file, await this.served(file));
      client.moduleGraph.invalidateAll();
      const fresh = new Map<string, string>();
      for (const file of files) fresh.set(file, await this.served(file));
      return { current, fresh };
    },
  };
}

/**
 * The host's committed output equals a cold build of the same tree, byte for byte, and Vite
 * serves every generated module as it serves it with no cached transform.
 * @param fixture The workspace.
 * @param host The running host.
 * @param options With `served: false`, only the committed tree is compared (nothing is requested).
 * @param options.served
 */
export async function expectCold(
  fixture: Fixture,
  host: Awaited<ReturnType<typeof startHost>>,
  options: { served?: boolean } = {},
) {
  const cold = await coldBuild(fixture);
  expect(await tree(fixture.output)).toEqual(await tree(cold));
  await rm(cold, { recursive: true, force: true });
  if (options.served === false) return;
  const { current, fresh } = await host.servedTwice();
  expect(current).toEqual(fresh);
  // Compiled by Analog, including the pages this edit created.
  for (const [file, code] of current) {
    if (file.endsWith('/page.ts')) expect(code, file).toContain('ɵɵdefineComponent');
  }
}

let colds = 0;

/**
 * A cold build of the fixture's current sources: a fresh output root beside the host's (so the
 * generated relative paths are the same) and a fresh cache. Neither is in the TypeScript program.
 * @param fixture
 */
async function coldBuild(fixture: Fixture): Promise<string> {
  const output = path.join(fixture.root, `cold-${++colds}`);
  const session = createGeneratorBuildSession(
    generatorOptions(fixture, output, path.join(fixture.root, `.cold-cache-${colds}`)),
  );
  try {
    const result = await session.buildOnce({ mode: 'development' });
    expect(result.status).toBe('success');
  } finally {
    await session.dispose();
  }
  return output;
}

/**
 * Every published file's bytes, by path, without the manifest (its generation differs).
 * @param root
 * @param prefix
 */
async function tree(root: string, prefix: string = ''): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  for (const entry of await readdir(path.join(root, prefix), { withFileTypes: true })) {
    const relative = path.posix.join(prefix, entry.name);
    if (entry.name === '.ng-doc-output-manifest.json') continue;
    if (entry.isDirectory()) Object.assign(files, await tree(root, relative));
    else files[relative] = await readFile(path.join(root, relative), 'utf8');
  }
  return files;
}

/**
 * The committed output manifest of `output`, or undefined while there is none.
 * @param output An output root.
 */
function committedManifest(
  output: string,
): { generation: number; files: Array<{ path: string; digest: string }> } | undefined {
  try {
    return JSON.parse(readFileSync(path.join(output, '.ng-doc-output-manifest.json'), 'utf8'));
  } catch {
    return undefined;
  }
}

/**
 * A manifest's files (path and digest), in path order.
 * @param manifest A committed manifest.
 */
function manifestFiles(manifest: ReturnType<typeof committedManifest>) {
  return (manifest?.files ?? [])
    .map(({ path: file, digest }) => ({ path: file, digest }))
    .sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
}

/**
 *
 * @param output
 */
async function generatedModules(output: string): Promise<string[]> {
  const manifest = JSON.parse(
    await readFile(path.join(output, '.ng-doc-output-manifest.json'), 'utf8'),
  );
  return (manifest.files as Array<{ path: string }>)
    .map((file) => file.path)
    .filter((file) => /\.ts$/.test(file))
    .sort();
}

/**
 *
 */
async function directory(): Promise<string> {
  const runtime = path.join(import.meta.dirname, '.runtime');
  await mkdir(runtime, { recursive: true });
  const root = await mkdtemp(path.join(runtime, 'ng-doc-page-tabs-'));
  temporary.push(root);
  return root;
}

/**
 *
 */
export async function project(): Promise<Fixture> {
  const root = await directory();
  const docs = path.join(root, 'docs');
  const output = path.join(root, 'generated');
  const cache = path.join(root, 'cache');
  const config = path.join(root, 'ng-doc.config.mjs');
  const tsconfig = path.join(root, 'tsconfig.json');
  const appTsconfig = path.join(root, 'tsconfig.app.json');
  const app = path.join(root, 'src/app.component.ts');
  await mkdir(path.join(docs, 'guide'), { recursive: true });
  await mkdir(path.join(root, 'src'), { recursive: true });
  await symlink(path.join(repository, 'node_modules'), path.join(root, 'node_modules'), 'dir');
  await writeFile(path.join(root, '.editorconfig'), 'root = true\n');
  await writeFile(
    config,
    "export default { docsPath: 'docs', tsConfig: 'tsconfig.json', routePrefix: '', cache: true };\n",
  );
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
      include: ['docs/**/*.ts', 'src/**/*.ts'],
    }),
  );
  // Analog's program also compiles the generated modules; the generator's never reads them.
  await writeFile(
    appTsconfig,
    JSON.stringify({
      extends: './tsconfig.json',
      include: ['docs/**/*.ts', 'src/**/*.ts', 'generated/**/*.ts'],
    }),
  );
  await writeFile(
    path.join(docs, 'guide/ng-doc.page.ts'),
    "const Guide = { title: 'Guide', route: 'guide', mdFile: './guide.md' };\nexport default Guide;\n",
  );
  await writeFile(path.join(docs, 'guide/guide.md'), '# Guide\nFirst tab body.\n');
  await writeFile(
    path.join(docs, 'guide/second.md'),
    '---\ntitle: Second\nroute: second-tab\n---\n\nSecond tab body.\n',
  );
  await writeFile(
    path.join(docs, 'guide/third.md'),
    '---\ntitle: Third\nroute: third-tab\n---\n\nThird tab body.\n',
  );
  await writeFile(
    app,
    "import { Component } from '@angular/core';\n@Component({ selector: 'fixture-app', template: 'app' })\nexport class AppComponent {}\n",
  );
  return { root, docs, output, cache, config, tsconfig, appTsconfig, app };
}

/**
 *
 * @param fixture
 * @param outputRoot
 * @param cacheRoot
 */
function generatorOptions(fixture: Fixture, outputRoot: string, cacheRoot: string) {
  return {
    projectId: 'page-tabs-fixture',
    workspaceRoot: fixture.root,
    configFile: fixture.config,
    defaults: { docsRoot: fixture.docs, tsConfig: fixture.tsconfig, outputRoot, cacheRoot },
    templateRoot: path.join(generatorDist, 'templates'),
    worker: {
      moduleUrl: pathToFileURL(path.join(generatorDist, 'compiler/index.js')),
      workerEntryUrl: pathToFileURL(path.join(generatorDist, 'worker/entry.js')),
    },
  };
}

/**
 *
 * @param fixture
 * @param angularPlugins
 */
function plugin(fixture: Fixture, angularPlugins: Plugin[]) {
  return createNgDocVitePlugin({
    analogLiveReload: true,
    angularPlugins,
    angularComponentProbe: fixture.app,
    generator: {
      ...generatorOptions(fixture, fixture.output, fixture.cache),
      session: { batchDelayMs: 5 },
    },
  });
}

/**
 *
 */
function packageAliases() {
  return ['app', 'core', 'ui-kit'].map((name) => ({
    find: `@ng-doc/${name}`,
    replacement: path.join(repository, `libs/${name}`),
  }));
}

/**
 *
 */
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

/**
 *
 * @param predicate
 * @param timeout
 */
async function waitFor(predicate: () => Promise<boolean>, timeout: number = 20_000): Promise<void> {
  const deadline = Date.now() + timeout;
  while (!(await predicate())) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for the Vite host update');
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}
