import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build, createServer, preview } from 'vite';
import { createNgDocAngularPlugins as angular } from '../../../../../dist/libs/builder/generator/vite/angular/index.js';

const root = fileURLToPath(new URL('../../../../../', import.meta.url));
// Loaded by a computed path: a static import of the site would make Nx record a builder -> ng-doc
// project dependency, and `ng-doc:build` already depends on `builder:build` (a task cycle).
const { productionFileReplacements } = await import(
  pathToFileURL(path.join(root, 'apps/ng-doc/vite.config.mjs')).href
);
const evidence = path.resolve(
  process.env.NGDOC_VITE_MAIN_EVIDENCE || path.join(root, 'tmp/acceptance/vite-main'),
);
await mkdir(evidence, { recursive: true });
await mkdir(path.join(root, 'tmp'), { recursive: true });
const productionOnly = process.env.NGDOC_VITE_MAIN_PHASE === 'production';
const fixture = productionOnly
  ? process.env.NGDOC_VITE_MAIN_FIXTURE
  : await mkdtemp(path.join(root, 'tmp/ngdoc-vite-main-'));
assert.ok(fixture, 'Production subprocess requires the parent fixture');
const resultName = productionOnly ? 'results-production.json' : 'results.json';
const generated = path.join(fixture, 'generated');
const require = createRequire(import.meta.url);
const generatorRoot =
  process.env.NGDOC_VITE_MAIN_GENERATOR || path.join(root, 'dist/libs/builder/generator');
const summary = {
  fixture,
  checks: [],
  errors: [],
  tuple: {
    node: process.version,
    vite: require('vite/package.json').version,
    analog: require('@analogjs/vite-plugin-angular/package.json').version,
    angular: require('@angular/core/package.json').version,
  },
  provenance: JSON.parse(await readFile(path.join(generatorRoot, 'build-provenance.json'), 'utf8')),
};
try {
  const { createNgDocVitePlugin } = await import(
    pathToFileURL(path.join(generatorRoot, 'vite/index.js')).href
  );
  const put = async (file, value) => {
    const target = path.join(fixture, file);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, value);
    return target;
  };
  const source = path.join(root, 'apps/ng-doc/src');
  const appPaths = JSON.parse(
    await readFile(path.join(root, 'apps/ng-doc/tsconfig.modern.json'), 'utf8'),
  ).compilerOptions.paths;
  appPaths['@ng-doc/generated'] = [path.join(generated, 'index.ts')];
  const tsconfig = await put(
    'tsconfig.json',
    JSON.stringify(
      {
        extends: path.join(root, 'apps/ng-doc/tsconfig.build.json'),
        compilerOptions: {
          module: 'esnext',
          moduleResolution: 'bundler',
          paths: appPaths,
          types: ['node'],
          esModuleInterop: true,
        },
        files: [
          path.join(source, 'main.ts'),
          path.join(source, 'main.server.ts'),
          path.join(fixture, 'entry.ts'),
          path.join(fixture, 'server.ts'),
        ],
        include: [path.join(source, '**/*.d.ts')],
      },
      null,
      2,
    ),
  );
  const config = await put(
    'ng-doc.config.ts',
    `import config from ${JSON.stringify(path.join(root, 'apps/ng-doc/ng-doc.config.ts'))};\nconst result = {...config, outDir: undefined, cache: true}; export default result;\n`,
  );
  await put('package.json', '{"private":true,"type":"module"}');
  await put(
    'entry.ts',
    `import 'zone.js'; import ${JSON.stringify(path.join(source, 'styles.scss'))}; import ${JSON.stringify(path.join(source, 'main.ts'))};\n`,
  );
  await put(
    'server.ts',
    `import 'zone.js/node'; import {enableProdMode, isDevMode} from '@angular/core'; ${productionOnly ? 'enableProdMode();' : ''} export const developmentMode = isDevMode; import { renderApplication } from '@angular/platform-server'; import bootstrap from ${JSON.stringify(path.join(source, 'main.server'))}; export const render = (document: string, url: string) => renderApplication(bootstrap, { document, url, allowedHosts: ['127.0.0.1'] });\n`,
  );
  const originalHtml = await readFile(path.join(source, 'index.html'), 'utf8');
  await put(
    'index.html',
    originalHtml.replace('</body>', '<script type="module" src="/entry.ts"></script></body>'),
  );
  await mkdir(path.join(fixture, 'public/assets/ng-doc'), { recursive: true });
  await cp(path.join(source, 'assets'), path.join(fixture, 'public/assets'), { recursive: true });
  for (const name of ['app', 'ui-kit'])
    if (existsSync(path.join(root, `dist/libs/${name}/assets`)))
      await cp(
        path.join(root, `dist/libs/${name}/assets`),
        path.join(fixture, `public/assets/ng-doc/${name}`),
        { recursive: true },
      );
  // Linked CommonJS libraries need explicit dependency optimization in this workspace.
  const linkedCoreImports = new Set(['@ng-doc/core']);
  for (const library of ['app', 'ui-kit']) {
    const directory = path.join(root, `dist/libs/${library}/fesm2022`);
    for (const name of await readdir(directory))
      if (name.endsWith('.mjs')) {
        const code = await readFile(path.join(directory, name), 'utf8');
        for (const match of code.matchAll(/['"](@ng-doc\/core(?:\/[^'"]*)?)['"]/g))
          linkedCoreImports.add(match[1]);
      }
  }
  // The C production replacements live in the committed Vite configuration, not in a B target.
  const productionReplacements = productionFileReplacements;
  function tracedAngular() {
    const plugins = angular({
      tsconfig,
      workspaceRoot: root,
      disableTypeChecking: false,
      jit: false,
      liveReload: true,
      inlineStylesExtension: 'scss',
      fileReplacements: productionOnly ? productionReplacements : [],
    });
    for (const plugin of [plugins].flat(Infinity)) {
      if (!plugin || typeof plugin !== 'object') continue;
      for (const name of ['buildStart', 'handleHotUpdate', 'hotUpdate']) {
        const hook = plugin[name];
        if (!hook) continue;
        const handler = typeof hook === 'function' ? hook : hook.handler;
        function traced(...args) {
          const compilationTrigger =
            plugin.name === '@analogjs/vite-plugin-angular' &&
            (name === 'buildStart' ||
              /\.[cm]?ts(?![a-z])/.test(args[0]?.file ?? '') ||
              /\.(html|htm|css|less|sass|scss)$/.test(args[0]?.file ?? ''));
          const event = {
            hook: name,
            plugin: plugin.name,
            compilationTrigger,
            file: args[0]?.file,
            generatedIndexExists: existsSync(path.join(generated, 'index.ts')),
            at: Date.now(),
          };
          summary.angularHooks ??= { counts: {}, early: [], samples: [] };
          summary.angularHooks.counts[name] = (summary.angularHooks.counts[name] ?? 0) + 1;
          if (!event.generatedIndexExists) summary.angularHooks.early.push(event);
          if (summary.angularHooks.samples.length < 20) {
            summary.angularHooks.samples.push(event);
            console.log('angular-hook', JSON.stringify(event));
          }
          return handler.apply(this, args);
        }
        plugin[name] = typeof hook === 'function' ? traced : { ...hook, handler: traced };
      }
    }
    return plugins;
  }
  const viteConfig = () => ({
    define: productionOnly ? { ngDevMode: 'false', ngJitMode: 'false' } : {},
    root: fixture,
    configFile: false,
    cacheDir: path.join(fixture, 'vite-cache'),
    plugins: [
      createNgDocVitePlugin({
        analogLiveReload: true,
        angularPlugins: tracedAngular(),
        angularComponentProbe: path.join(source, 'app/app.component.ts'),
        generator: {
          projectId: 'ng-doc-vite-main',
          workspaceRoot: root,
          configFile: config,
          defaults: {
            docsRoot: path.join(root, 'apps/ng-doc/docs'),
            tsConfig: tsconfig,
            outputRoot: generated,
            cacheRoot: path.join(fixture, 'cache'),
          },
        },
      }),
    ],
    optimizeDeps: { include: [...linkedCoreImports].sort() },
    resolve: {
      alias: [{ find: '@ng-doc/core', replacement: path.join(root, 'dist/libs/core') }],
      dedupe: [
        '@angular/core',
        '@angular/common',
        '@angular/compiler',
        '@angular/platform-browser',
        '@angular/router',
      ],
    },
    css: { preprocessorOptions: { scss: { loadPaths: [root] } } },
    server: { host: '127.0.0.1', port: 0, fs: { allow: [root] } },
    build: {
      outDir: path.join(fixture, 'browser'),
      emptyOutDir: true,
      commonjsOptions: { include: [/node_modules/, /dist\/libs\/core\//] },
    },
    ssr: {
      // The development module runner must transform partial-Angular libraries, while ordinary
      // installed dependencies stay external so Node handles their package format. Blanket
      // `noExternal: true` makes that runner evaluate CommonJS `exports` from packages such as
      // RxJS and @braintree/sanitize-url. The production Rollup build can bundle the complete
      // graph because its CommonJS pipeline handles those packages and yields a standalone SSR
      // artifact.
      noExternal: productionOnly
        ? true
        : [/^@ng-doc\//, /^@angular\//, /^@ng-web-apis\//, /^@taiga-ui\//, /^di-controls(?:\/|$)/],
      optimizeDeps: { include: [...linkedCoreImports].sort() },
    },
  });
  let server, browser, productionPreview;
  const mark = (name, details = {}) => {
    summary.checks.push({ name, ...details });
    console.log(name, JSON.stringify(details));
  };
  try {
    const playwright = require(
      process.env.PLAYWRIGHT_MODULE ||
        '/Users/alex/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright',
    );
    browser = await playwright.chromium.launch({
      executablePath:
        process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      headless: true,
    });
    const routes = [
      '/docs/get-started/installation',
      '/docs/demos-and-playgrounds/demos',
      '/docs/api/classes/app/NgDocPageLinkComponent',
    ];
    let indexes;
    const page = await browser.newPage();
    page.on('pageerror', (error) =>
      summary.errors.push({ kind: 'pageerror', message: error.message }),
    );
    page.on('console', (event) => {
      if (event.type() === 'error') summary.errors.push({ kind: 'console', message: event.text() });
    });
    page.on('response', (response) => {
      if (response.status() >= 400)
        summary.errors.push({ kind: 'http', url: response.url(), status: response.status() });
    });
    if (!productionOnly) {
      mark('server-create-start');
      server = await createServer(viteConfig());
      mark('server-created');
      assert.deepEqual(
        (summary.angularHooks?.early ?? []).filter((event) => event.compilationTrigger),
        [],
        'Analog compilation hook ran before generated index existed',
      );
      await server.listen();
      mark('server-listening');
      const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
      for (const route of routes) {
        mark('browser-route-start', { route });
        const response = await page.goto(origin + route);
        assert.equal(response.status(), 200);
        await page.locator('ng-doc-page').waitFor({ timeout: 90000 });
        await page.waitForFunction(
          () => document.querySelector('ng-doc-page')?.textContent?.trim().length > 100,
          { timeout: 90000 },
        );
        const text = await page.locator('ng-doc-page').innerText();
        assert.ok(text.length > 100);
        assert.equal(new URL(page.url()).pathname, route);
        mark('dev-route', { route, characters: text.length });
        if (route.endsWith('/demos')) {
          await page.getByRole('button', { name: 'Just a button', exact: true }).first().click();
          await page.getByText('Button was clicked!', { exact: true }).waitFor();
          mark('selfhosted-demo-click');
        }
      }
      indexes = await (await fetch(origin + '/assets/ng-doc/indexes.json')).text();
      assert.deepEqual(
        JSON.parse(indexes),
        JSON.parse(await readFile(path.join(generated, 'assets/indexes.json'), 'utf8')),
      );
      mark('search-inventory', {
        bytes: Buffer.byteLength(indexes),
        sha256: createHash('sha256').update(indexes).digest('hex'),
      });
      await page.screenshot({ path: path.join(evidence, 'dev.png'), fullPage: false });
      const ssr = await server.ssrLoadModule('/server.ts');
      const html = await ssr.render(originalHtml, origin + routes[0]);
      assert.ok(html.includes('Installation'));
      await writeFile(path.join(evidence, 'dev-ssr.html'), html);
      mark('dev-ssr', { bytes: html.length });
      assert.deepEqual(summary.errors, []);
      await server.close();
      server = undefined;
      await browser.close();
      browser = undefined;
      // SSR installs Zone in this process. A normal production CLI runs in a fresh Node process.
      const child = spawn(process.execPath, [fileURLToPath(import.meta.url)], {
        stdio: 'inherit',
        env: {
          ...process.env,
          NGDOC_VITE_MAIN_PHASE: 'production',
          NGDOC_VITE_MAIN_FIXTURE: fixture,
          NGDOC_VITE_MAIN_EVIDENCE: evidence,
          KEEP_VITE_MAIN_FIXTURE: '1',
        },
      });
      const [code, signal] = await once(child, 'close');
      const productionResult = JSON.parse(
        await readFile(path.join(evidence, 'results-production.json'), 'utf8'),
      );
      summary.production = productionResult;
      assert.equal(code, 0, productionResult.failure || `Production subprocess stopped: ${signal}`);
      mark('isolated-production-acceptance', { checks: productionResult.checks.length });
    } else {
      indexes = await readFile(path.join(generated, 'assets/indexes.json'), 'utf8');
      await build(viteConfig());
      mark('production-build');
      assert.ok(
        (await readFile(path.join(fixture, 'browser/index.html'), 'utf8')).includes(
          'data-ng-doc-theme-restore',
        ),
      );
      assert.deepEqual(
        JSON.parse(
          await readFile(path.join(fixture, 'browser/assets/ng-doc/indexes.json'), 'utf8'),
        ),
        JSON.parse(indexes),
      );
      mark('production-search-parity');
      const ssrConfig = viteConfig();
      ssrConfig.build = {
        ...ssrConfig.build,
        ssr: path.join(fixture, 'server.ts'),
        outDir: path.join(fixture, 'server'),
      };
      await build(ssrConfig);
      mark('production-ssr-build');
      productionPreview = await preview({
        configFile: false,
        root: fixture,
        build: { outDir: path.join(fixture, 'browser') },
        preview: { host: '127.0.0.1', port: 0 },
      });
      const productionOrigin = `http://127.0.0.1:${productionPreview.httpServer.address().port}`;
      const productionSsr = await import(
        pathToFileURL(path.join(fixture, 'server/server.js')).href
      );
      assert.equal(
        productionSsr.developmentMode(),
        false,
        'Production SSR must use Angular production mode',
      );
      const productionDocument = await readFile(path.join(fixture, 'browser/index.html'), 'utf8');
      for (const route of routes) {
        const rendered = await productionSsr.render(productionDocument, productionOrigin + route);
        assert.ok(rendered.includes('ngh='), 'Expected serialized Angular hydration metadata');
        const filename = path.join(fixture, 'browser', route, 'index.html');
        await mkdir(path.dirname(filename), { recursive: true });
        await writeFile(filename, rendered);
        mark('production-prerender-route', { route, bytes: rendered.length });
      }
      await page.goto(productionOrigin + routes[1]);
      assert.equal(
        await page.evaluate(() => !!globalThis.ngDevMode),
        false,
        'Production browser must disable Angular dev mode',
      );
      await page.getByRole('button', { name: 'Just a button', exact: true }).first().click();
      await page.getByText('Button was clicked!', { exact: true }).waitFor();
      assert.deepEqual(summary.errors, []);
      mark('production-hydration-demo-click');
      await page.screenshot({ path: path.join(evidence, 'production.png'), fullPage: false });
    }
  } catch (error) {
    summary.failure = error.stack || String(error);
    throw error;
  } finally {
    await browser?.close();
    await server?.close();
    if (productionPreview)
      await new Promise((resolve, reject) =>
        productionPreview.httpServer.close((error) => (error ? reject(error) : resolve())),
      );
    await writeFile(path.join(evidence, resultName), JSON.stringify(summary, null, 2));
    if (process.env.KEEP_VITE_MAIN_FIXTURE !== '1')
      await rm(fixture, { recursive: true, force: true });
  }
} catch (error) {
  summary.failure = error.stack || String(error);
  await writeFile(path.join(evidence, resultName), JSON.stringify(summary, null, 2));
  if (process.env.KEEP_VITE_MAIN_FIXTURE !== '1')
    await rm(fixture, { recursive: true, force: true });
  throw error;
}
