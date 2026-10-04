import { mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { type ViteDevServer, build, createServer } from 'vite';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  checkOptionKeys,
  collectAssets,
  createNgDocApplicationPlugin,
  matchAssets,
  NG_DOC_BROWSER_ENTRY,
  NG_DOC_SERVER_ENTRY,
  resolveAssets,
  serverPolyfills,
  withBase,
} from '../application';
import { NG_DOC_DEV_STYLE_GATE } from '../dev-styles';
import { contentType } from '../mime';

const temporary: string[] = [];
const servers: ViteDevServer[] = [];

afterEach(async () => {
  await Promise.allSettled(servers.splice(0).map((server) => server.close()));
  await Promise.all(temporary.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function workspace(): Promise<string> {
  // Outside the repository: nothing above it resolves the NgDoc UI packages.
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'ng-doc-application-')));
  temporary.push(root);
  const put = async (file: string, text: string) => {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), text);
  };
  await put(
    'src/index.html',
    '<!doctype html><html><head><base href="/"><title>App</title></head><body><app-root></app-root></body></html>\n',
  );
  await put('src/polyfill.js', 'globalThis.order = ["polyfill"];\n');
  await put('src/styles.css', 'body { color: rgb(1, 2, 3); }\n');
  await put(
    'src/main.js',
    'globalThis.order.push("main"); globalThis.dev = typeof ngDevMode === "undefined" ? "none" : ngDevMode;\n',
  );
  await put('src/main.server.js', 'export default () => "bootstrap";\n');
  await put('src/extra.ts', 'export {};\n');
  await put('src/assets/logo.txt', 'logo\n');
  await put('src/assets/nested/deep.txt', 'deep\n');
  await put('src/assets/skip.txt', 'skip\n');
  await put('src/favicon.txt', 'icon\n');
  await put('vendor/assets/icon.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>\n');
  await put('vendor/assets/logo.txt', 'vendor logo\n');
  return root;
}

function plugin(
  root: string,
  extra: Partial<Parameters<typeof createNgDocApplicationPlugin>[0]> = {},
) {
  return createNgDocApplicationPlugin({
    workspaceRoot: root,
    sourceRoot: 'src',
    browser: 'src/main.js',
    polyfills: ['./src/polyfill.js'],
    styles: ['src/styles.css'],
    assets: [
      'src/assets',
      'src/favicon.txt',
      { glob: '**/*', input: 'vendor/assets', output: '/assets/vendor/', ignore: ['**/*.txt'] },
    ],
    ...extra,
  });
}

type Hook = (...args: unknown[]) => unknown;
const hook = (value: unknown): Hook =>
  (typeof value === 'function' ? value : (value as { handler: Hook }).handler) as Hook;

describe('createNgDocApplicationPlugin', () => {
  it('validates its options', () => {
    expect(() => createNgDocApplicationPlugin(undefined as never)).toThrow(
      /options must be an object/,
    );
    expect(() => createNgDocApplicationPlugin({ browser: '' })).toThrow(
      '[NGDOC_VITE_APPLICATION] browser must be a non-empty string.',
    );
    expect(() => createNgDocApplicationPlugin({ browser: 'main.ts', server: '\0' })).toThrow(
      /server/,
    );
    expect(() =>
      createNgDocApplicationPlugin({ browser: 'main.ts', polyfills: [1 as never] }),
    ).toThrow(/polyfills\[0\]/);
    expect(() => createNgDocApplicationPlugin({ browser: 'main.ts', styles: [''] })).toThrow(
      /styles\[0\]/,
    );
  });

  it('rejects Angular CLI options it does not take, naming their equivalent', () => {
    expect(() =>
      createNgDocApplicationPlugin({
        browser: 'main.ts',
        fileReplacements: [],
        tsConfig: 'tsconfig.app.json',
        colour: 'blue',
      } as never),
    ).toThrow(
      '[NGDOC_VITE_APPLICATION_OPTION] createNgDocApplicationPlugin does not take `colour` (unknown option), `fileReplacements` (use createNgDocAngularPlugins({ fileReplacements })), `tsConfig` (use createNgDocAngularPlugins({ tsconfig })).',
    );
    expect(checkOptionKeys({ browser: 'a', budgets: [], outputHashing: 'all' })).toEqual([
      '[NGDOC_VITE_APPLICATION_OPTION] createNgDocApplicationPlugin ignores `budgets`: Vite has no size budgets.',
      '[NGDOC_VITE_APPLICATION_OPTION] createNgDocApplicationPlugin ignores `outputHashing`: Vite hashes the output file names by default.',
    ]);
    const warn = vi.fn();
    const application = createNgDocApplicationPlugin({
      browser: 'main.ts',
      sourceMap: true,
    } as never);
    hook(application.configResolved)({ logger: { warn }, base: '/' });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('ignores `sourceMap`'));
  });

  it('keeps only the server polyfills Angular keeps, and escapes or adds <base href>', () => {
    expect(
      serverPolyfills(['zone.js', 'zone.js/node', '@angular/localize/init', 'core-js', 'src/p.ts']),
    ).toEqual(['zone.js/node', '@angular/localize/init']);
    expect(withBase('<head><base href="/"></head>', '/a"&<b/')).toBe(
      '<head><base href="/a&quot;&amp;&lt;b/"></head>',
    );
    expect(withBase('<head><base href="/"></head>', '/$&$1/')).toBe(
      '<head><base href="/$&amp;$1/"></head>',
    );
    expect(withBase('<html><head lang="x"><title>t</title></head>', '/p/')).toBe(
      '<html><head lang="x"><base href="/p/"><title>t</title></head>',
    );
    expect(withBase('<p>no head</p>', '/p/')).toBe('<p>no head</p>');
    expect(withBase('<head><base href="/"></head>', './')).toBe('<head><base href="/"></head>');
  });

  it('generates the browser and server entries from the Angular CLI options', async () => {
    const root = await workspace();
    const application = plugin(root, {
      polyfills: ['zone.js', './src/polyfill.js', 'src/extra.ts'],
      server: 'src/main.server.js',
    });
    const resolveId = hook(application.resolveId);
    const load = hook(application.load);
    expect(application.api.ngDocApplication).toEqual({
      schemaVersion: 1,
      serverEntry: NG_DOC_SERVER_ENTRY,
    });
    const browserId = resolveId(NG_DOC_BROWSER_ENTRY) as string;
    const serverId = resolveId(NG_DOC_SERVER_ENTRY) as string;
    expect(resolveId('/src/main.ts')).toBeNull();
    expect(load('/src/main.ts')).toBeNull();
    expect(load(browserId)).toBe(
      [
        'import "zone.js";',
        `import "${root}/src/polyfill.js";`,
        `import "${root}/src/extra.ts";`,
        `import "${root}/src/styles.css";`,
        `import "${root}/src/main.js";`,
      ].join('\n'),
    );
    expect(load(serverId)).toBe(
      [
        'import "zone.js/node";',
        `export { default as bootstrap } from "${root}/src/main.server.js";`,
        "export { renderApplication } from '@angular/platform-server';",
        "export { Router } from '@angular/router';",
        "export { runInInjectionContext } from '@angular/core';",
      ].join('\n'),
    );

    const client = plugin(root);
    expect(client.api.ngDocApplication).toEqual({ schemaVersion: 1 });
    expect(() => hook(client.resolveId)(NG_DOC_SERVER_ENTRY)).toThrow(/NGDOC_VITE_SERVER_ENTRY/);
  });

  it('marks the entry imports and the application files side-effectful in builds only', async () => {
    const root = await workspace();
    const application = plugin(root);
    const resolveId = hook(application.resolveId);
    const transform = hook(application.transform);
    const browserId = resolveId(NG_DOC_BROWSER_ENTRY) as string;
    const resolve = vi.fn(async (source: string) =>
      source === 'external' ? { id: source, external: true } : { id: `/resolved/${source}` },
    );
    const context = { resolve };
    // Development: Vite resolves the entry imports itself, and nothing is tree-shaken.
    expect(resolveId.call(context, 'zone.js', browserId, {})).toBeNull();
    expect(transform.call(context, '', `${root}/src/main.js`)).toBeNull();
    hook(application.configResolved)({ command: 'serve', build: {}, base: '/' });
    expect(transform.call(context, '', `${root}/src/main.js`)).toBeNull();
    expect(resolve).not.toHaveBeenCalled();

    hook(application.configResolved)({ command: 'build', build: {}, base: '/' });
    expect(transform.call(context, '', `${root}/src/main.js`)).toEqual({ moduleSideEffects: true });
    await expect(
      resolveId.call(context, 'zone.js', browserId, { isEntry: false }),
    ).resolves.toEqual({ id: '/resolved/zone.js', moduleSideEffects: true });
    expect(resolve).toHaveBeenCalledWith('zone.js', browserId, { isEntry: false, skipSelf: true });
    await expect(resolveId.call(context, 'external', browserId, {})).resolves.toEqual({
      id: 'external',
      external: true,
    });
    resolve.mockResolvedValueOnce(null as never);
    await expect(resolveId.call(context, 'missing', browserId, {})).resolves.toBeNull();
    // Only the browser entry's imports; dependencies are left to their package.json.
    expect(resolveId.call(context, 'zone.js', `${root}/src/main.js`, {})).toBeNull();
    const filter = (application.transform as { filter: { id: { exclude: RegExp[] } } }).filter;
    const excluded = (id: string) => filter.id.exclude.some((pattern) => pattern.test(id));
    expect(excluded(`${root}/src/main.js`)).toBe(false);
    expect(excluded(`${root}/node_modules/rxjs/index.js`)).toBe(true);
    expect(excluded('C:\\app\\node_modules\\rxjs\\index.js')).toBe(true);
    expect(excluded('\0ng-doc-application:browser')).toBe(true);
  });

  it('configures production defines, the server bundle and the NgDoc core prebundles', async () => {
    const root = await workspace();
    const packages = path.join(root, 'node_modules/@ng-doc');
    for (const name of ['app', 'ui-kit']) {
      await mkdir(path.join(packages, name, 'fesm2022'), { recursive: true });
      await writeFile(path.join(packages, name, 'package.json'), `{"name":"@ng-doc/${name}"}`);
    }
    await writeFile(
      path.join(packages, 'app/fesm2022/ng-doc-app.mjs'),
      'import {a} from \'@ng-doc/core/helpers/a\'; import {b} from "@ng-doc/core";\n',
    );
    await writeFile(path.join(packages, 'app/fesm2022/notes.txt'), "'@ng-doc/core/ignored'");
    await writeFile(
      path.join(packages, 'ui-kit/fesm2022/ng-doc-ui-kit.mjs'),
      "import {c} from '@ng-doc/core/helpers/a';\n",
    );
    const config = hook(
      plugin(root, { polyfills: ['zone.js', './src/polyfill.js', '@angular/localize/init'] })
        .config,
    );
    expect(
      await config({ root: path.join(root, 'src') }, { command: 'serve', mode: 'development' }),
    ).toEqual({
      resolve: { dedupe: expect.arrayContaining(['@angular/core', '@angular/router']) },
      // The scan starts from the browser entry's files, which the index page does not name.
      optimizeDeps: {
        include: ['@angular/localize/init', '@ng-doc/core', '@ng-doc/core/helpers/a', 'zone.js'],
        entries: ['polyfill.js', 'main.js'],
      },
    });
    await rm(path.join(packages, 'ui-kit/fesm2022'), { recursive: true });
    // `tslib`, which compiled code imports, once the application has it.
    await mkdir(path.join(root, 'node_modules/tslib'), { recursive: true });
    await writeFile(path.join(root, 'node_modules/tslib/package.json'), '{"name":"tslib"}');
    await mkdir(path.join(root, 'web (1)'));
    expect(
      await config({ root: path.join(root, 'web (1)') }, { command: 'serve', mode: 'development' }),
    ).toMatchObject({
      optimizeDeps: {
        include: [
          '@angular/localize/init',
          '@ng-doc/core',
          '@ng-doc/core/helpers/a',
          'tslib',
          'zone.js',
        ],
        // Relative to the Vite root, and escaped: the scan reads them as glob patterns.
        entries: ['../src/polyfill.js', '../src/main.js'],
      },
    });
    expect(
      await hook(plugin(root, { polyfills: [] }).config)(
        { root },
        { command: 'serve', mode: 'development' },
      ),
    ).toMatchObject({
      optimizeDeps: {
        include: ['@ng-doc/core', '@ng-doc/core/helpers/a', 'tslib'],
        entries: ['src/main.js'],
      },
    });
    expect(await config({}, { command: 'build', mode: 'production' })).toEqual({
      resolve: { dedupe: expect.any(Array) },
      define: { ngDevMode: 'false', ngJitMode: 'false' },
    });
    expect(await config({}, { command: 'build', mode: 'development', isSsrBuild: true })).toEqual({
      resolve: { dedupe: expect.any(Array) },
      define: { ngDevMode: 'false', ngJitMode: 'false' },
      ssr: { noExternal: true },
    });
    expect(
      await config({ define: { ngDevMode: 'true' } }, { command: 'build', mode: 'staging' }),
    ).toEqual({ resolve: { dedupe: expect.any(Array) }, define: { ngJitMode: 'false' } });
  });

  it('builds the application: entry order, styles, base, defines and copied assets', async () => {
    const root = await workspace();
    const outDir = path.join(root, 'dist/browser');
    await build({
      root: path.join(root, 'src'),
      base: '/preview/',
      configFile: false,
      logLevel: 'silent',
      publicDir: false,
      plugins: [plugin(root)],
      build: { outDir, emptyOutDir: true },
    });
    const html = await readFile(path.join(outDir, 'index.html'), 'utf8');
    expect(html).toContain('<base href="/preview/">');
    expect(html).toMatch(
      /<script type="module" crossorigin src="\/preview\/assets\/index-[\w-]+\.js">/,
    );
    const files = (await readdir(outDir, { recursive: true })).map(String).sort();
    const script = files.find((file) => /^assets\/index-.*\.js$/.test(file))!;
    const code = await readFile(path.join(outDir, script), 'utf8');
    // Vite 8's Oxc minifier prints string literals as templates.
    const polyfill = code.search(/["`]polyfill["`]/);
    expect(polyfill).toBeGreaterThan(-1);
    expect(polyfill).toBeLessThan(code.search(/["`]main["`]/));
    expect(code).not.toContain('ngDevMode');
    expect(files.some((file) => /^assets\/index-.*\.css$/.test(file))).toBe(true);
    expect(files).toEqual(
      expect.arrayContaining([
        'assets/logo.txt',
        'assets/nested/deep.txt',
        'assets/vendor/icon.svg',
        'favicon.txt',
      ]),
    );
    expect(files).not.toContain('assets/vendor/logo.txt');
    expect(await readFile(path.join(outDir, 'assets/logo.txt'), 'utf8')).toBe('logo\n');

    // A relative base leaves <base href> alone.
    await build({
      root: path.join(root, 'src'),
      base: './',
      configFile: false,
      logLevel: 'silent',
      publicDir: false,
      plugins: [plugin(root, { assets: [] })],
      build: { outDir, emptyOutDir: true },
    });
    expect(await readFile(path.join(outDir, 'index.html'), 'utf8')).toContain('<base href="/">');
  });

  it('keeps the application and its polyfills when package.json says "sideEffects": false', async () => {
    const root = await workspace();
    const put = async (file: string, text: string) => {
      await mkdir(path.dirname(path.join(root, file)), { recursive: true });
      await writeFile(path.join(root, file), text);
    };
    // A library repository: its root package.json declares the library free of side effects.
    await put('package.json', '{ "name": "library-repository", "sideEffects": false }\n');
    await put(
      'src/main.js',
      'import "./register.js"; import "pure-dependency"; globalThis.order.push("main");\n',
    );
    await put('src/register.js', 'globalThis.registered = "registered-module";\n');
    for (const name of ['pure-dependency', 'dependency-polyfill']) {
      await put(
        `node_modules/${name}/package.json`,
        `{ "name": "${name}", "sideEffects": false, "main": "index.js" }\n`,
      );
      await put(`node_modules/${name}/index.js`, `globalThis.dependency = "${name}-code";\n`);
    }
    const outDir = path.join(root, 'dist/browser');
    await build({
      root: path.join(root, 'src'),
      configFile: false,
      logLevel: 'silent',
      publicDir: false,
      plugins: [plugin(root, { polyfills: ['./src/polyfill.js', 'dependency-polyfill'] })],
      build: { outDir, emptyOutDir: true },
    });
    const files = (await readdir(outDir, { recursive: true })).map(String);
    const code = await readFile(
      path.join(outDir, files.find((file) => /^assets\/index-.*\.js$/.test(file))!),
      'utf8',
    );
    // The bootstrap and what it imports for its side effects, as in the Angular CLI.
    expect(code).toMatch(/["`]main["`]/);
    expect(code).toContain('registered-module');
    expect(code).toMatch(/["`]polyfill["`]/);
    // A polyfill is an entry of the Angular CLI's build: never left out.
    expect(code).toContain('dependency-polyfill-code');
    // Dependencies keep their own declaration: an import for side effects only is still dropped.
    expect(code).not.toContain('pure-dependency-code');
    expect(files.some((file) => /^assets\/index-.*\.css$/.test(file))).toBe(true);
  });

  it('emits assets only into client builds and refuses to replace a bundle file', async () => {
    const root = await workspace();
    const application = plugin(root, { assets: ['src/favicon.txt'] });
    const generateBundle = hook(application.generateBundle);
    const emitted: unknown[] = [];
    const context = { emitFile: (file: unknown) => emitted.push(file) };
    await generateBundle.call(context, {}, {});
    expect(emitted).toEqual([]);
    hook(application.configResolved)({ command: 'build', build: { ssr: true }, base: '/' });
    await generateBundle.call(context, {}, {});
    expect(emitted).toEqual([]);
    hook(application.configResolved)({ command: 'build', build: {}, base: '/' });
    await expect(generateBundle.call(context, {}, { 'favicon.txt': {} })).rejects.toThrow(
      '[NGDOC_VITE_ASSET_COLLISION] Vite bundle already owns favicon.txt.',
    );
  });

  it('serves the entry, the index page and the assets in development', async () => {
    const root = await workspace();
    const server = await createServer({
      root: path.join(root, 'src'),
      // Its own dependency cache (below a node_modules folder, as linters and editors skip): the
      // default one is shared by every fixture.
      cacheDir: path.join(root, '.vite/node_modules/.vite'),
      base: '/preview/',
      configFile: false,
      logLevel: 'silent',
      publicDir: false,
      plugins: [plugin(root)],
      server: { host: '127.0.0.1', port: 0, fs: { allow: [root] } },
      optimizeDeps: { noDiscovery: true },
    });
    servers.push(server);
    await server.listen();
    const origin = `http://127.0.0.1:${(server.httpServer!.address() as { port: number }).port}`;
    const html = await (
      await fetch(`${origin}/preview/`, { headers: { accept: 'text/html' } })
    ).text();
    expect(html).toContain('<base href="/preview/">');
    expect(html).toContain(`src="/preview${NG_DOC_BROWSER_ENTRY}"`);
    // The first paint has the global styles: inlined with the id Vite's client adopts, so the
    // module's own copy updates this element instead of adding a second one.
    const head = html.slice(0, html.indexOf('</head>'));
    expect(head).toContain(
      `<style type="text/css" data-vite-dev-id="${path.join(root, 'src/styles.css')}">body { color: rgb(1, 2, 3); }`,
    );
    expect(head).toContain(NG_DOC_DEV_STYLE_GATE);
    // Inlining reads the module the page imports anyway: a second module of the same sheet
    // would be hot-updated on every edit, and the client would reload the page.
    const sheetModules = server.environments.client.moduleGraph.getModulesByFile(
      path.join(root, 'src/styles.css'),
    );
    expect([...(sheetModules ?? [])].map(({ url }) => url)).toEqual(['/styles.css']);
    const styleModule = await (await fetch(`${origin}/preview/styles.css`)).text();
    expect(styleModule).toContain(
      `const __vite__id = ${JSON.stringify(path.join(root, 'src/styles.css'))}`,
    );
    const entry = await (await fetch(`${origin}/preview${NG_DOC_BROWSER_ENTRY}`)).text();
    expect(entry).toContain('main.js');
    const logo = await fetch(`${origin}/preview/assets/logo.txt`);
    expect(logo.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(await logo.text()).toBe('logo\n');
    const icon = await fetch(`${origin}/preview/assets/vendor/icon.svg`);
    expect(icon.headers.get('content-type')).toBe('image/svg+xml; charset=utf-8');
    expect((await fetch(`${origin}/preview/favicon.txt`)).status).toBe(200);
    // Ignored and unknown files fall through to Vite.
    expect(await (await fetch(`${origin}/preview/assets/vendor/logo.txt`)).text()).not.toBe(
      'vendor logo\n',
    );
    await rm(path.join(root, 'src/assets/skip.txt'));
    expect(await (await fetch(`${origin}/preview/assets/skip.txt`)).text()).not.toBe('skip\n');
  });

  it('serves an asset of an earlier entry that a later, broader entry does not have', async () => {
    // The order of an Nx project: the UI kit's icons, then the project's public folder at the
    // output root, whose `**/*` also matches the icon's output path.
    const root = await workspace();
    await mkdir(path.join(root, 'public'), { recursive: true });
    await writeFile(path.join(root, 'public/robots.txt'), 'robots\n');
    // A directory where the later entry would have the file.
    await mkdir(path.join(root, 'public/assets/ng-doc/ui-kit/logo.txt'), { recursive: true });
    const server = await createServer({
      root: path.join(root, 'src'),
      cacheDir: path.join(root, '.vite/node_modules/.vite'),
      configFile: false,
      logLevel: 'silent',
      publicDir: false,
      plugins: [
        plugin(root, {
          assets: [
            { glob: '**/*', input: 'vendor/assets', output: 'assets/ng-doc/ui-kit' },
            { glob: '**/*', input: 'public' },
          ],
        }),
      ],
      server: { host: '127.0.0.1', port: 0, fs: { allow: [root] } },
      optimizeDeps: { noDiscovery: true },
    });
    servers.push(server);
    await server.listen();
    const origin = `http://127.0.0.1:${(server.httpServer!.address() as { port: number }).port}`;
    const icon = await fetch(`${origin}/assets/ng-doc/ui-kit/icon.svg`, {
      headers: { accept: 'image/svg+xml,*/*' },
    });
    expect(icon.headers.get('content-type')).toBe('image/svg+xml; charset=utf-8');
    expect(await icon.text()).toBe('<svg xmlns="http://www.w3.org/2000/svg"/>\n');
    expect(await (await fetch(`${origin}/robots.txt`)).text()).toBe('robots\n');
    // A directory is no file: the earlier entry is asked next.
    expect(await (await fetch(`${origin}/assets/ng-doc/ui-kit/logo.txt`)).text()).toBe(
      'vendor logo\n',
    );
  });

  it('serves the index page when a global style sheet does not compile', async () => {
    const root = await workspace();
    await writeFile(path.join(root, 'src/broken.scss'), 'body { color: ; ');
    const server = await createServer({
      root: path.join(root, 'src'),
      // Its own dependency cache (below a node_modules folder, as linters and editors skip): the
      // default one is shared by every fixture.
      cacheDir: path.join(root, '.vite/node_modules/.vite'),
      configFile: false,
      logLevel: 'silent',
      publicDir: false,
      plugins: [plugin(root, { styles: ['src/broken.scss', 'src/styles.css'] })],
      server: { host: '127.0.0.1', port: 0, fs: { allow: [root] } },
      optimizeDeps: { noDiscovery: true },
    });
    servers.push(server);
    await server.listen();
    const origin = `http://127.0.0.1:${(server.httpServer!.address() as { port: number }).port}`;
    const html = await (await fetch(`${origin}/`, { headers: { accept: 'text/html' } })).text();
    expect(html).not.toContain('broken.scss"');
    expect(html).toContain(`data-vite-dev-id="${path.join(root, 'src/styles.css')}"`);
  });

  it('inlines a global style sheet outside the Vite root, in order', async () => {
    const root = await workspace();
    await writeFile(path.join(root, 'vendor/outside.css'), 'main { color: rgb(4, 5, 6); }\n');
    const server = await createServer({
      root: path.join(root, 'src'),
      // Its own dependency cache (below a node_modules folder, as linters and editors skip): the
      // default one is shared by every fixture.
      cacheDir: path.join(root, '.vite/node_modules/.vite'),
      configFile: false,
      logLevel: 'silent',
      publicDir: false,
      // A script among the styles is no style module: it is left to the page.
      plugins: [plugin(root, { styles: ['vendor/outside.css', 'src/extra.ts', 'src/styles.css'] })],
      server: { host: '127.0.0.1', port: 0, fs: { allow: [root] } },
      optimizeDeps: { noDiscovery: true },
    });
    servers.push(server);
    await server.listen();
    const origin = `http://127.0.0.1:${(server.httpServer!.address() as { port: number }).port}`;
    const html = await (await fetch(`${origin}/`, { headers: { accept: 'text/html' } })).text();
    const outside = html.indexOf(`data-vite-dev-id="${path.join(root, 'vendor/outside.css')}"`);
    const inside = html.indexOf(`data-vite-dev-id="${path.join(root, 'src/styles.css')}"`);
    expect(outside).toBeGreaterThan(0);
    expect(inside).toBeGreaterThan(outside);
    expect(html).toContain('main { color: rgb(4, 5, 6); }');
    expect(html).not.toContain('extra.ts"');
  });

  it('adds no development style tags to a build', async () => {
    const root = await workspace();
    const application = plugin(root);
    const result = (await hook(application.transformIndexHtml)(
      '<html><head></head><body></body></html>',
      { path: '/index.html', filename: path.join(root, 'src/index.html') },
    )) as { tags: Array<{ tag: string }> };
    expect(result.tags.map(({ tag }) => tag)).toEqual(['script']);
  });

  it('reports asset resolution failures to the development server', async () => {
    const root = await workspace();
    const middlewares: Array<
      (request: unknown, response: unknown, next: (error?: unknown) => void) => void
    > = [];
    const application = plugin(root, { assets: ['src/missing'] });
    hook(application.configureServer)({
      middlewares: { use: (handler: never) => middlewares.push(handler) },
      config: { base: '/' },
    });
    const error = await new Promise((resolve) => middlewares[0]({ url: '/x' }, {}, resolve));
    expect(String(error)).toMatch(/assets\[0\] does not exist/);
  });
});

describe('assets', () => {
  it('resolves path and glob entries like the Angular CLI', async () => {
    const root = await workspace();
    const assets = await resolveAssets(
      ['src/assets', 'src/favicon.txt', { glob: '*.svg', input: 'vendor/assets' }],
      root,
      path.join(root, 'src'),
    );
    expect(assets).toEqual([
      { input: path.join(root, 'src/assets'), output: 'assets', glob: '**/*', ignore: [] },
      { input: path.join(root, 'src'), output: '', glob: 'favicon.txt', ignore: [] },
      { input: path.join(root, 'vendor/assets'), output: '', glob: '*.svg', ignore: [] },
    ]);
    await expect(resolveAssets([null as never], root, root)).rejects.toThrow(
      /assets\[0\] is invalid/,
    );
    await expect(
      resolveAssets([{ glob: '**/*', input: 'x', output: '../out' }], root, root),
    ).rejects.toThrow(/assets\[0\]\.output must stay inside/);
    await expect(
      resolveAssets([{ glob: '**/*', input: 'x', output: 'a/../../b' }], root, root),
    ).rejects.toThrow(/must stay inside/);
    await expect(resolveAssets([{ glob: '', input: 'x' }], root, root)).rejects.toThrow(/glob/);
    await expect(resolveAssets(['vendor/assets'], root, path.join(root, 'src'))).rejects.toThrow(
      /assets\[0\] \(vendor\/assets\) is outside sourceRoot/,
    );

    const files = await collectAssets([
      ...assets,
      {
        input: path.join(root, 'vendor/assets'),
        output: 'assets',
        glob: '**/*',
        ignore: ['icon.svg'],
      },
    ]);
    expect(files.get('assets/logo.txt')).toBe(path.join(root, 'vendor/assets/logo.txt'));
    expect(files.get('icon.svg')).toBe(path.join(root, 'vendor/assets/icon.svg'));
    expect(files.has('assets/icon.svg')).toBe(false);
  });

  it('lists the asset files a development request can name, the last entry first', () => {
    const assets = [
      { input: '/a', output: '', glob: '**/*', ignore: [] },
      { input: '/b', output: 'assets', glob: '*.svg', ignore: ['skip.svg'] },
    ];
    expect(matchAssets(assets, '/base/', '/base/assets/x.svg?v=1')).toEqual([
      { file: path.join('/b', 'x.svg'), relative: 'x.svg' },
      // The earlier entry matches too: it serves the file when the later one lacks it.
      { file: path.join('/a', 'assets/x.svg'), relative: 'assets/x.svg' },
    ]);
    expect(matchAssets(assets, '/base', '/base/assets/skip.svg')).toEqual([
      { file: path.join('/a', 'assets/skip.svg'), relative: 'assets/skip.svg' },
    ]);
    expect(matchAssets(assets, './', '/top.txt')).toEqual([
      { file: path.join('/a', 'top.txt'), relative: 'top.txt' },
    ]);
    expect(matchAssets(assets, '/base/', '/other/x.svg')).toEqual([]);
    expect(matchAssets(assets, '/', '/a/../b')).toEqual([]);
    expect(matchAssets(assets, '/', '/a/..%5C..%5Csecret')).toEqual([]);
    expect(matchAssets(assets, '/', '/a%00b')).toEqual([]);
    expect(matchAssets(assets, '/', '/%E0%A4%A')).toEqual([]);
    expect(matchAssets([assets[1]], '/', '/elsewhere/x.svg')).toEqual([]);
  });
});

describe('contentType', () => {
  it('knows the common asset types', () => {
    expect(contentType('a/b.WOFF2')).toBe('font/woff2');
    expect(contentType('site.webmanifest')).toBe('application/manifest+json; charset=utf-8');
    expect(contentType('favicon.ico')).toBe('image/x-icon');
    expect(contentType('data.bin')).toBe('application/octet-stream');
  });
});
