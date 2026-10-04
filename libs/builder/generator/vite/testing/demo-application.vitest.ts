import { mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { type Plugin, type ViteDevServer, build, createServer } from 'vite';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createNgDocApplicationPlugin,
  demoDocument,
  NG_DOC_BROWSER_ENTRY,
  NG_DOC_DEMO_ENTRY,
  NG_DOC_DEMO_SERVER_ENTRY,
  NG_DOC_SERVER_ENTRY,
} from '../application';
import {
  type NgDocDemoApplication,
  type NgDocDemoApplicationApi,
  readDemoApplication,
} from '../demo-application';

const temporary: string[] = [];
const servers: ViteDevServer[] = [];

afterEach(async () => {
  await Promise.allSettled(servers.splice(0).map((server) => server.close()));
  await Promise.all(temporary.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

/** The generated demo module, as `demo-app.ts.nunj` writes it (in JavaScript). */
const DEMO_MODULE = [
  "export const NG_DOC_DEMO_PATH = 'demo-preview';",
  'export const NG_DOC_DEMO_PAGES: string[] = ["demo-preview/docs/start/Button","demo-preview/docs/start/Card"];',
  "export const NG_DOC_DEMO_ROUTES = [{ path: 'demo-preview/docs/start', children: [] }];",
  'export const NG_DOC_DEMO_PROVIDERS = undefined;',
  '',
].join('\n');

const PAGES = ['demo-preview/docs/start/Button', 'demo-preview/docs/start/Card'];

async function workspace(): Promise<string> {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'ng-doc-demo-application-')));
  temporary.push(root);
  const put = async (file: string, text: string) => {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), text);
  };
  await put(
    'src/index.html',
    '<!doctype html><html lang="en"><head><base href="/"><title>App</title></head><body class="site"><app-root></app-root></body></html>\n',
  );
  await put('src/styles.css', 'body { color: rgb(1, 2, 3); }\n');
  await put('src/main.js', 'globalThis.started = "docs";\n');
  await put('src/main.server.js', 'export default () => "bootstrap";\n');
  await put('generated/demo-app.ts', DEMO_MODULE);
  return root;
}

/**
 * The NgDoc plugin's side of the demo application, as a stub.
 */
function ngDoc(demo: () => NgDocDemoApplication | undefined): Plugin & { calls: string[] } {
  const calls: string[] = [];
  const api: NgDocDemoApplicationApi = {
    schemaVersion: 1,
    resolve: async () => {
      calls.push('resolve');
      return demo();
    },
    current: async () => {
      calls.push('current');
      return demo();
    },
  };
  return { name: 'stub:ng-doc', api: { ngDocDemoApplication: api }, calls };
}

/** Leaves Angular and NgDoc to the application: the fixture has no node_modules. */
const externals: Plugin = {
  name: 'stub:externals',
  enforce: 'pre',
  resolveId(source: string) {
    return /^@(angular|ng-doc)\//.test(source) ? { id: source, external: true } : null;
  },
};

function application(root: string, polyfills: string[] = []) {
  return createNgDocApplicationPlugin({
    workspaceRoot: root,
    sourceRoot: 'src',
    browser: 'src/main.js',
    server: 'src/main.server.js',
    polyfills,
    styles: ['src/styles.css'],
  });
}

type Hook = (...args: unknown[]) => unknown;
const hook = (value: unknown): Hook =>
  (typeof value === 'function' ? value : (value as { handler: Hook }).handler) as Hook;

describe('the demo application', () => {
  it('has the head of index.html and the demo root as its body', () => {
    expect(
      demoDocument(
        '<html><head><base href="/"></head><body class="site">\n<app-root></app-root>\n</body></html>',
      ),
    ).toBe(
      '<html><head><base href="/"></head><body class="site"><ng-doc-demo-app></ng-doc-demo-app></body></html>',
    );
    expect(demoDocument('<p>no body</p>')).toBe(
      '<p>no body</p><ng-doc-demo-app></ng-doc-demo-app>',
    );
  });

  it('reads the generated module of a committed output root', async () => {
    const root = await workspace();
    expect(await readDemoApplication(path.join(root, 'missing'))).toBeUndefined();
    await writeFile(path.join(root, 'demo-app.ts'), DEMO_MODULE);
    expect(await readDemoApplication(root)).toEqual({
      module: path.join(root, 'demo-app.ts'),
      path: 'demo-preview',
      pages: PAGES,
    });
    for (const broken of [
      '// no path\n',
      DEMO_MODULE.replace(
        /NG_DOC_DEMO_PAGES: string\[\] = .*;/,
        'NG_DOC_DEMO_PAGES: string[] = [1];',
      ),
      DEMO_MODULE.replace(
        /NG_DOC_DEMO_PAGES: string\[\] = .*;/,
        'NG_DOC_DEMO_PAGES: string[] = [;',
      ),
    ]) {
      await writeFile(path.join(root, 'demo-app.ts'), broken);
      expect(await readDemoApplication(root)).toBeUndefined();
    }
  });

  it('generates the browser and server entries of the demo application', async () => {
    const root = await workspace();
    const module = path.join(root, 'generated/demo-app.ts');
    const plugin = application(root, ['zone.js', '@angular/localize/init']);
    hook(plugin.configResolved)({
      command: 'serve',
      root: path.join(root, 'src'),
      base: '/',
      build: {},
      logger: { warn: () => {} },
      plugins: [ngDoc(() => ({ module, path: 'demo-preview', pages: PAGES }))],
    });
    const resolveId = hook(plugin.resolveId);
    const load = hook(plugin.load);
    const browser = (await load.call({}, resolveId(NG_DOC_DEMO_ENTRY))) as string;
    expect(browser.split('\n')).toEqual([
      'import "zone.js";',
      'import "@angular/localize/init";',
      `import "${root}/src/styles.css";`,
      "import { bootstrapApplication } from '@angular/platform-browser';",
      "import { NgDocDemoAppComponent, ɵngDocDemoApplicationConfig } from '@ng-doc/app/demo-app';",
      `import { NG_DOC_DEMO_PROVIDERS, NG_DOC_DEMO_ROUTES } from "${module}";`,
      'ɵngDocDemoApplicationConfig(NG_DOC_DEMO_ROUTES, NG_DOC_DEMO_PROVIDERS, { zone: true })',
      '  .then((config) => bootstrapApplication(NgDocDemoAppComponent, config))',
      '  .catch((error) => console.error(error));',
    ]);
    const server = (await load.call({}, resolveId(NG_DOC_DEMO_SERVER_ENTRY))) as string;
    expect(server).toContain('import "zone.js/node";\nimport "@angular/localize/init";');
    expect(server).not.toContain('styles.css');
    expect(server).toContain('providers: [provideServerRendering()],');
    expect(server).toContain('export const bootstrap = async (context) =>');
    expect(server).toContain("export { renderApplication } from '@angular/platform-server';");
  });

  it('fails to load its entries without demo pages', async () => {
    const root = await workspace();
    const plugin = application(root);
    hook(plugin.configResolved)({
      command: 'serve',
      root: path.join(root, 'src'),
      base: '/',
      build: {},
      logger: { warn: () => {} },
      plugins: [ngDoc(() => undefined)],
    });
    await expect(
      hook(plugin.load).call({}, hook(plugin.resolveId)(NG_DOC_DEMO_ENTRY)),
    ).rejects.toThrow(/NGDOC_VITE_DEMO_APPLICATION/);
    // No NgDoc plugin: no demo application either.
    const alone = application(root);
    hook(alone.configResolved)({
      command: 'build',
      root: path.join(root, 'src'),
      base: '/',
      build: {},
      logger: { warn: () => {} },
      plugins: [],
    });
    expect(await hook(alone.options)({ input: 'index.html' })).toBeNull();
  });

  it('builds the demo page as a second input when the generation has demo pages', async () => {
    const root = await workspace();
    const module = path.join(root, 'generated/demo-app.ts');
    const outDir = path.join(root, 'dist/browser');
    const stub = ngDoc(() => ({ module, path: 'demo-preview', pages: PAGES }));
    await build({
      root: path.join(root, 'src'),
      base: '/site/',
      configFile: false,
      logLevel: 'silent',
      publicDir: false,
      plugins: [externals, application(root), stub],
      build: { outDir, emptyOutDir: true },
    });
    expect(stub.calls).toEqual(['resolve']);
    const files = (await readdir(outDir, { recursive: true })).map(String).sort();
    const index = await readFile(path.join(outDir, 'index.html'), 'utf8');
    const page = await readFile(path.join(outDir, 'ng-doc-demo.html'), 'utf8');
    expect(index).toContain('<app-root></app-root>');
    expect(index).toMatch(/src="\/site\/assets\/index-[\w-]+\.js"/);
    expect(page).toContain('<base href="/site/">');
    expect(page).toContain('<body class="site"><ng-doc-demo-app></ng-doc-demo-app>');
    expect(page).toMatch(/src="\/site\/assets\/ng-doc-demo-[\w-]+\.js"/);
    // Both pages have the global styles.
    expect(page).toMatch(/<link rel="stylesheet" crossorigin href="\/site\/assets\/[\w-]+\.css">/);
    const script = files.find((file) => /^assets\/ng-doc-demo-.*\.js$/.test(file))!;
    const code = await readFile(path.join(outDir, script), 'utf8');
    expect(code).toContain('@ng-doc/app/demo-app');
    expect(code).toContain('demo-preview/docs/start');
    // The demo page does not load the documentation application.
    expect(code).not.toContain('started');
    expect(page).not.toMatch(/assets\/index-[\w-]+\.js/);
    // Each demo page is a copy of it, which prerendering would replace.
    for (const route of PAGES) {
      expect(await readFile(path.join(outDir, route, 'index.html'), 'utf8')).toBe(page);
    }
  });

  it('builds the same output as before when the generation has no demo pages', async () => {
    const root = await workspace();
    const outputs: string[][] = [];
    for (const plugins of [[], [ngDoc(() => undefined)]]) {
      const outDir = path.join(root, `dist/browser-${outputs.length}`);
      await build({
        root: path.join(root, 'src'),
        configFile: false,
        logLevel: 'silent',
        publicDir: false,
        plugins: [externals, application(root), ...plugins],
        build: { outDir, emptyOutDir: true },
      });
      outputs.push(
        await Promise.all(
          (await readdir(outDir, { recursive: true }))
            .map(String)
            .sort()
            .map(
              async (file) =>
                `${file}:${await readFile(path.join(outDir, file), 'utf8').catch(() => '')}`,
            ),
        ),
      );
    }
    expect(outputs[1]).toEqual(outputs[0]);
    expect(outputs[0].some((file) => file.startsWith('ng-doc-demo.html'))).toBe(false);
  });

  it('builds the demo server entry next to the server entry', async () => {
    const root = await workspace();
    const module = path.join(root, 'generated/demo-app.ts');
    const outDir = path.join(root, 'dist/server');
    await build({
      root: path.join(root, 'src'),
      configFile: false,
      logLevel: 'silent',
      publicDir: false,
      plugins: [
        externals,
        application(root),
        ngDoc(() => ({ module, path: 'demo-preview', pages: PAGES })),
      ],
      build: {
        ssr: true,
        outDir,
        emptyOutDir: true,
        rolldownOptions: {
          input: { server: NG_DOC_SERVER_ENTRY },
          output: { format: 'es', entryFileNames: '[name].mjs' },
        },
      },
    });
    const files = (await readdir(outDir)).map(String).sort();
    expect(files).toEqual(expect.arrayContaining(['demo-server.mjs', 'server.mjs']));
    const demoServer = await readFile(path.join(outDir, 'demo-server.mjs'), 'utf8');
    expect(demoServer).toContain('provideServerRendering');
    expect(demoServer).toContain('demo-preview/docs/start');
  });

  it('adds its inputs next to the inputs it goes with, whatever their shape', async () => {
    const root = await workspace();
    const module = path.join(root, 'generated/demo-app.ts');
    const plugin = application(root);
    const resolved = (ssr: boolean) => ({
      command: 'build',
      root: path.join(root, 'src'),
      base: '/',
      build: { ssr },
      logger: { warn: () => {} },
      plugins: [ngDoc(() => ({ module, path: 'demo-preview', pages: PAGES }))],
    });
    const options = hook(plugin.options);
    const page = path.join(root, 'src/ng-doc-demo.html');
    const index = path.join(root, 'src/index.html');
    hook(plugin.configResolved)(resolved(false));
    expect(await options({ input: index })).toEqual({
      input: { index, 'ng-doc-demo': page },
    });
    expect(await options({ input: [index, path.join(root, 'src/other.html')] })).toEqual({
      input: { index, other: path.join(root, 'src/other.html'), 'ng-doc-demo': page },
    });
    expect(await options({})).toEqual({ input: { index, 'ng-doc-demo': page } });
    // A build without index.html (a library's own input) gets no demo page.
    expect(await options({ input: { lib: path.join(root, 'src/lib.js') } })).toEqual({
      input: { lib: path.join(root, 'src/lib.js') },
    });
    hook(plugin.configResolved)(resolved(true));
    expect(await options({ input: { server: NG_DOC_SERVER_ENTRY } })).toEqual({
      input: { server: NG_DOC_SERVER_ENTRY, 'demo-server': NG_DOC_DEMO_SERVER_ENTRY },
    });
  });

  it('serves the demo page under the demo path in development, while there are demo pages', async () => {
    const root = await workspace();
    const module = path.join(root, 'generated/demo-app.ts');
    let current: NgDocDemoApplication | undefined = { module, path: 'previews/live', pages: [] };
    const server = await createServer({
      root: path.join(root, 'src'),
      cacheDir: path.join(root, '.vite/node_modules/.vite'),
      base: '/site/',
      configFile: false,
      logLevel: 'silent',
      publicDir: false,
      plugins: [externals, application(root), ngDoc(() => current)],
      server: { host: '127.0.0.1', port: 0, fs: { allow: [root] } },
      optimizeDeps: { noDiscovery: true },
    });
    servers.push(server);
    await server.listen();
    const origin = `http://127.0.0.1:${(server.httpServer!.address() as { port: number }).port}`;
    const page = (url: string, accept = 'text/html') =>
      fetch(`${origin}${url}`, { headers: { accept } }).then((response) => response.text());

    const demo = await page('/site/previews/live/docs/start/ButtonDemo?inputs=%7B%7D');
    expect(demo).toContain('<ng-doc-demo-app></ng-doc-demo-app>');
    expect(demo).toContain(`src="/site${NG_DOC_DEMO_ENTRY}"`);
    expect(demo).not.toContain(NG_DOC_BROWSER_ENTRY);
    expect(demo).toContain('<base href="/site/">');
    // Other pages are the documentation's.
    const docs = await page('/site/docs/start');
    expect(docs).toContain(`src="/site${NG_DOC_BROWSER_ENTRY}"`);
    expect(docs).not.toContain('<ng-doc-demo-app>');
    // A request for something else than a page is left to Vite.
    expect(await page('/site/previews/live/docs/start/ButtonDemo', '*/*')).not.toContain(
      '<ng-doc-demo-app>',
    );
    // Without demo pages, the demo path is a documentation route like any other.
    current = undefined;
    expect(await page('/site/previews/live/docs/start/ButtonDemo')).toContain(
      `src="/site${NG_DOC_BROWSER_ENTRY}"`,
    );
  });
});
