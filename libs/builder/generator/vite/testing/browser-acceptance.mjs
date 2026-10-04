import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createNgDocAngularPlugins as angular } from '../../../../../dist/libs/builder/generator/vite/angular/index.js';
import { chromium } from '/Users/alex/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import { createServer } from 'vite';

const repository = fileURLToPath(new URL('../../../../../', import.meta.url));
// NGDOC_VITE_BROWSER_EVIDENCE (evidence commands set it explicitly), else a runner's
// NGDOC_TEST_EVIDENCE_DIR, else the git-ignored tmp/vite-browser-acceptance. A plain run never
// writes into tracked docs/ evidence.
const evidence = path.resolve(
  process.env.NGDOC_VITE_BROWSER_EVIDENCE ??
    process.env.NGDOC_TEST_EVIDENCE_DIR ??
    path.join(repository, 'tmp/vite-browser-acceptance'),
);
const reloadRace = process.env.NGDOC_VITE_RELOAD_RACE === '1';
const runtimeRoot = path.join(repository, 'libs/builder/generator/vite/testing/.runtime');
await mkdir(runtimeRoot, { recursive: true });
const fixture = await mkdtemp(path.join(runtimeRoot, 'ng-doc-vite-browser-'));
const generated = path.join(fixture, 'generated');
const cache = path.join(fixture, 'cache');
const docs = path.join(fixture, 'docs');
const expectedSourceDigest = process.env.NGDOC_EXPECTED_SOURCE_DIGEST;
const generatorConfigSource = `export default { docsPath: 'docs', tsConfig: 'tsconfig.json', routePrefix: '', cache: true };\n`;
const summary = {
  status: 'running',
  fixture,
  tuple: { node: process.version, sourceDigest: undefined, reloadRace },
  checks: [],
  browserErrors: [],
  httpErrors: [],
  loads: [],
};
let phase = 'initial';

await mkdir(evidence, { recursive: true });
await mkdir(docs, { recursive: true });

const put = async (relative, content) => {
  const target = path.join(fixture, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content);
  return target;
};

const record = (name, details = {}) => {
  summary.checks.push({ name, at: Date.now(), ...details });
  process.stdout.write(`${name} ${JSON.stringify(details)}\n`);
};

const waitFor = async (description, predicate, timeout = 60_000) => {
  const deadline = Date.now() + timeout;
  let lastError;
  while (Date.now() <= deadline) {
    try {
      if (await predicate()) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for ${description}${lastError ? `: ${lastError}` : ''}`);
};

// Attach a rejection observer at creation time. A later HTTP recovery wait can
// otherwise let Playwright's timeout reject before this harness reaches its
// corresponding await; Node 24 then exits before the outer catch/finally can
// record the failure and close the owned browser, server, and fixture. The
// returned function rethrows that same failure at the existing assertion site.
const observeWait = (promise) => {
  const outcome = promise.then(
    (value) => ({ value }),
    (error) => ({ error }),
  );
  return async () => {
    const settled = await outcome;
    if ('error' in settled) throw settled.error;
    return settled.value;
  };
};

const generatedRoutes = () => readFile(path.join(generated, 'routes.ts'), 'utf8');
const htmlStatus = async (origin) =>
  (await fetch(`${origin}/acceptance/home`, { headers: { accept: 'text/html' } })).status;

const pageModule = (name, title = name) =>
  `const page = { title: ${JSON.stringify(title)}, route: ${JSON.stringify(name)}, mdFile: './${name}.md' };\nexport default page;\n`;

const applicationSource = (sourceMarker) => `import 'zone.js';
import {provideHttpClient, withFetch} from '@angular/common/http';
import {Component} from '@angular/core';
import {bootstrapApplication} from '@angular/platform-browser';
import {provideRouter, RouterOutlet} from '@angular/router';
import {NG_DOC_DEFAULT_PAGE_PROCESSORS, NG_DOC_DEFAULT_PAGE_SKELETON, NgDocDefaultSearchEngine, provideMainPageProcessor, provideNgDocApp, providePageSkeleton, provideSearchEngine} from '@ng-doc/app';
import {NG_DOC_ROUTING, provideNgDocContext} from '@ng-doc/generated';
@Component({selector: 'missing-route', template: '<p>Missing route</p>'})
class MissingRouteComponent {}
@Component({selector: 'app-root', imports: [RouterOutlet], template: '<router-outlet /><p id="source-marker">${sourceMarker}</p>'})
class AppComponent {}
bootstrapApplication(AppComponent, {providers: [provideHttpClient(withFetch()), provideNgDocContext(), provideNgDocApp(), provideSearchEngine(NgDocDefaultSearchEngine), providePageSkeleton(NG_DOC_DEFAULT_PAGE_SKELETON), provideMainPageProcessor(NG_DOC_DEFAULT_PAGE_PROCESSORS), provideRouter([...NG_DOC_ROUTING, {path: '**', component: MissingRouteComponent}])]});
fetch('/acceptance/probe.txt').then(response => response.text()).then(value => document.body.dataset.asset = value.trim());
`;

const navigateAndAssert = async (page, url, marker, timeout = 60_000) => {
  const response = await page.goto(url, { timeout });
  assert.equal(response?.status(), 200, `Navigation failed for ${url}`);
  await page.getByText(marker, { exact: true }).waitFor({ timeout });
};

let server;
let browser;
try {
  const provenance = JSON.parse(
    await readFile(
      path.join(repository, 'dist/libs/builder/generator/build-provenance.json'),
      'utf8',
    ),
  );
  if (expectedSourceDigest) {
    assert.equal(
      provenance.sourceDigest,
      expectedSourceDigest,
      'Unexpected shared generator package',
    );
  }
  summary.tuple.sourceDigest = provenance.sourceDigest;
  const { createNgDocVitePlugin } = await import(
    pathToFileURL(path.join(repository, 'dist/libs/builder/generator/vite/index.js')).href
  );

  const sharedInclude = await put('docs/shared.nunj', 'Same-byte include recovery marker.\n');
  await put(
    'docs/home.md',
    '# Browser home\n\nInitial browser acceptance marker.\n\n{% include "./shared.nunj" %}\n',
  );
  await put('docs/ng-doc.page.ts', pageModule('home', 'Browser home'));
  const generatorConfig = await put('ng-doc.config.ts', generatorConfigSource);
  const tsconfig = await put(
    'tsconfig.json',
    JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'bundler',
          strict: true,
          experimentalDecorators: true,
          useDefineForClassFields: false,
          skipLibCheck: true,
          paths: {
            '@ng-doc/generated': [path.join(generated, 'index.ts')],
            '@ng-doc/generated/*': [path.join(generated, '*')],
            '@ng-doc/app': [path.join(repository, 'dist/libs/app')],
            '@ng-doc/app/*': [path.join(repository, 'dist/libs/app/*')],
            '@ng-doc/core': [path.join(repository, 'dist/libs/core')],
            '@ng-doc/core/*': [path.join(repository, 'dist/libs/core/*')],
            '@ng-doc/ui-kit': [path.join(repository, 'dist/libs/ui-kit')],
            '@ng-doc/ui-kit/*': [path.join(repository, 'dist/libs/ui-kit/*')],
          },
        },
        angularCompilerOptions: { strictTemplates: true, strictInjectionParameters: true },
        include: ['src/**/*.ts', 'docs/**/*.ts', 'generated/**/*.ts'],
      },
      null,
      2,
    ),
  );
  const application = await put('src/main.ts', applicationSource('Source runtime marker one.'));
  const publicProbe = await put('public/probe.txt', 'asset-one\n');
  await put(
    'index.html',
    '<!doctype html><html><head><base href="/acceptance/"><link rel="icon" href="data:,"></head><body><app-root></app-root><script type="module" src="/src/main.ts"></script></body></html>',
  );
  if (existsSync(path.join(repository, 'dist/libs/ui-kit/assets'))) {
    await cp(
      path.join(repository, 'dist/libs/ui-kit/assets'),
      path.join(fixture, 'public/assets/ng-doc/ui-kit'),
      { recursive: true },
    );
  }

  const linkedCoreImports = new Set(['@ng-doc/core']);
  for (const library of ['app', 'ui-kit']) {
    const fesm = path.join(repository, `dist/libs/${library}/fesm2022`);
    for (const file of await import('node:fs/promises').then(({ readdir }) => readdir(fesm))) {
      if (!file.endsWith('.mjs')) continue;
      const code = await readFile(path.join(fesm, file), 'utf8');
      for (const match of code.matchAll(/['"](@ng-doc\/core(?:\/[^'"]*)?)['"]/g)) {
        linkedCoreImports.add(match[1]);
      }
    }
  }

  const angularPlugins = angular({
    tsconfig,
    workspaceRoot: fixture,
    disableTypeChecking: false,
    jit: false,
    liveReload: true,
  });
  const ngDoc = createNgDocVitePlugin({
    analogLiveReload: true,
    angularPlugins,
    angularComponentProbe: application,
    generator: {
      projectId: 'vite-browser-acceptance',
      workspaceRoot: fixture,
      configFile: generatorConfig,
      defaults: { docsRoot: docs, tsConfig: tsconfig, outputRoot: generated, cacheRoot: cache },
      session: { batchDelayMs: 5 },
    },
  });
  let gateArmed = false;
  let releaseGate;
  const generatedGate = new Promise((resolve) => {
    releaseGate = resolve;
  });
  const gateEvents = [];
  const gatePlugin = {
    name: 'ng-doc-generated-update-gate',
    enforce: 'pre',
    hotUpdate: {
      order: 'pre',
      async handler(context) {
        if (!gateArmed || !context.file.startsWith(`${generated}${path.sep}`)) return;
        const event = { type: context.type, file: context.file, at: Date.now() };
        gateEvents.push(event);
        if (context.type === 'update' && /\.[cm]?ts(?![a-z])/.test(context.file)) {
          await generatedGate;
        }
      },
    },
  };
  server = await createServer({
    root: fixture,
    cacheDir: path.join(fixture, '.vite-cache'),
    configFile: false,
    base: '/acceptance/',
    logLevel: 'warn',
    plugins: [ngDoc, ...(reloadRace ? [gatePlugin] : [])],
    optimizeDeps: { include: [...linkedCoreImports].sort() },
    resolve: {
      alias: [
        { find: '@ng-doc/app', replacement: path.join(repository, 'dist/libs/app') },
        { find: '@ng-doc/core', replacement: path.join(repository, 'dist/libs/core') },
        { find: '@ng-doc/ui-kit', replacement: path.join(repository, 'dist/libs/ui-kit') },
      ],
      dedupe: [
        '@angular/common',
        '@angular/compiler',
        '@angular/core',
        '@angular/platform-browser',
        '@angular/router',
      ],
    },
    server: { host: '127.0.0.1', port: 0, fs: { allow: [repository, fixture] } },
  });
  await server.listen();
  const address = server.httpServer?.address();
  assert.ok(address && typeof address !== 'string');
  const origin = `http://127.0.0.1:${address.port}`;

  browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });
  const page = await browser.newPage();
  page.on('load', () => summary.loads.push({ phase, at: Date.now(), url: page.url() }));
  page.on('pageerror', (error) =>
    summary.browserErrors.push({ phase, kind: 'pageerror', message: error.message }),
  );
  page.on('console', (event) => {
    if (event.type() === 'error')
      summary.browserErrors.push({
        phase,
        kind: 'console',
        message: event.text(),
        location: event.location(),
      });
  });
  page.on('response', (response) => {
    if (response.status() >= 400)
      summary.httpErrors.push({ phase, status: response.status(), url: response.url() });
  });

  await page.goto(`${origin}/acceptance/home`);
  await page.getByText('Initial browser acceptance marker.', { exact: true }).waitFor();
  await page.waitForFunction(() => document.body.dataset.asset === 'asset-one');
  record('initial-generated-route-rendered');

  phase = reloadRace ? 'race-create' : 'create';
  const loadCountBeforeCreate = summary.loads.length;
  const createdReload = reloadRace
    ? undefined
    : observeWait(page.waitForEvent('load', { timeout: 60_000 }));
  gateArmed = reloadRace;
  const dynamicPage = path.join(docs, 'dynamic/ng-doc.page.ts');
  const dynamicMarkdown = path.join(docs, 'dynamic/dynamic.md');
  await mkdir(path.dirname(dynamicPage), { recursive: true });
  await writeFile(dynamicMarkdown, '# Dynamic guide\n\nFresh guide creation marker.\n');
  await writeFile(dynamicPage, pageModule('dynamic', 'Dynamic guide'));
  await waitFor('dynamic route publication', async () =>
    (await generatedRoutes()).includes("path: 'dynamic'"),
  );
  record('fresh-guide-physically-published');
  if (reloadRace) {
    await waitFor('a held generated TypeScript update', async () =>
      gateEvents.some((event) => event.type === 'update' && /\.[cm]?ts(?![a-z])/.test(event.file)),
    );
  }
  if (reloadRace) {
    phase = 'race-held';
    let pipelineReload;
    try {
      assert.equal(
        summary.loads.length,
        loadCountBeforeCreate,
        'Browser loaded before the generated TypeScript gate was observed',
      );
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      assert.equal(
        summary.loads.length,
        loadCountBeforeCreate,
        'Browser loaded while generated TypeScript compilation was held',
      );
      record('controlled-reload-withheld-while-generated-typescript-held', {
        heldForMs: 1_000,
        loadCount: summary.loads.length,
      });
      pipelineReload = observeWait(page.waitForEvent('load', { timeout: 60_000 }));
    } finally {
      releaseGate();
      gateArmed = false;
    }
    assert.ok(pipelineReload, 'Automatic reload observer was not installed before gate release');
    await pipelineReload();
    record('fresh-guide-vite-pipeline-reload-completed', { url: page.url() });
    summary.reloadRace = {
      loadCountBeforeCreate,
      loadCountAfterAutomaticReload: summary.loads.length,
      gateEvents,
    };
    phase = 'race-released';
    await navigateAndAssert(page, `${origin}/acceptance/dynamic`, 'Fresh guide creation marker.');
    record('controlled-reload-race-rendered-after-one-post-release-navigation');
  } else {
    await createdReload();
    record('fresh-guide-announced-reload-completed', { url: page.url() });
    await navigateAndAssert(page, `${origin}/acceptance/dynamic`, 'Fresh guide creation marker.');
  }
  phase = 'created';
  record('fresh-guide-created-and-rendered');

  await writeFile(dynamicMarkdown, '# Dynamic guide\n\nEdited guide browser marker.\n');
  await page
    .getByText('Edited guide browser marker.', { exact: true })
    .waitFor({ timeout: 60_000 });
  record('markdown-edit-visible-without-restart');

  phase = 'source-only';
  const unchangedRoutes = await generatedRoutes();
  const generatedPageFile = path.join(generated, 'guides/dynamic/index/page.ts');
  const unchangedPage = await readFile(generatedPageFile, 'utf8');
  await writeFile(application, applicationSource('Source runtime marker two.'));
  await page.getByText('Source runtime marker two.', { exact: true }).waitFor({ timeout: 60_000 });
  assert.equal(
    await generatedRoutes(),
    unchangedRoutes,
    'Source-only edit changed generated routes',
  );
  assert.equal(
    await readFile(generatedPageFile, 'utf8'),
    unchangedPage,
    'Source-only edit changed generated page TypeScript',
  );
  record('source-only-runtime-edit-visible-with-generated-typescript-unchanged');

  await navigateAndAssert(page, `${origin}/acceptance/home`, 'Initial browser acceptance marker.');
  phase = 'expected-error';
  const lastGoodRoutes = await generatedRoutes();
  await writeFile(dynamicPage, 'const broken = ;\n');
  await waitFor('adapter HTML failure response', async () => (await htmlStatus(origin)) === 500);
  assert.equal(
    await generatedRoutes(),
    lastGoodRoutes,
    'Compiler failure changed last-good output',
  );
  record('typescript-error-preserved-last-good');

  const repairedReload = observeWait(page.waitForEvent('load', { timeout: 60_000 }));
  await writeFile(dynamicPage, pageModule('dynamic', 'Dynamic guide'));
  await waitFor('adapter error recovery', async () => (await htmlStatus(origin)) === 200);
  await repairedReload();
  phase = 'repaired';
  await navigateAndAssert(page, `${origin}/acceptance/dynamic`, 'Edited guide browser marker.');
  record('typescript-error-repaired');

  await navigateAndAssert(page, `${origin}/acceptance/home`, 'Initial browser acceptance marker.');
  phase = 'expected-config-error';
  const configLastGoodRoutes = await generatedRoutes();
  await writeFile(generatorConfig, 'export default { docsPath: ; };\n');
  await waitFor('configuration failure response', async () => (await htmlStatus(origin)) === 500);
  assert.equal(
    await generatedRoutes(),
    configLastGoodRoutes,
    'Configuration failure changed last-good output',
  );
  record('configuration-typescript-error-preserved-last-good');

  const configRepairReload = observeWait(page.waitForEvent('load', { timeout: 60_000 }));
  await writeFile(generatorConfig, generatorConfigSource);
  await waitFor('configuration repair response', async () => (await htmlStatus(origin)) === 200);
  await configRepairReload();
  phase = 'config-repaired';
  await page.getByText('Initial browser acceptance marker.', { exact: true }).waitFor();
  record('configuration-typescript-identical-output-repair-reloaded');

  phase = 'expected-include-error';
  const includeLastGoodRoutes = await generatedRoutes();
  await rm(sharedInclude);
  await waitFor('missing include failure response', async () => (await htmlStatus(origin)) === 500);
  assert.equal(
    await generatedRoutes(),
    includeLastGoodRoutes,
    'Missing include changed last-good output',
  );
  record('missing-include-preserved-last-good');

  const includeRepairReload = observeWait(page.waitForEvent('load', { timeout: 60_000 }));
  await writeFile(sharedInclude, 'Same-byte include recovery marker.\n');
  await waitFor(
    'same-byte include repair response',
    async () => (await htmlStatus(origin)) === 200,
  );
  await includeRepairReload();
  phase = 'include-repaired';
  await page.getByText('Same-byte include recovery marker.', { exact: true }).waitFor();
  record('same-byte-include-repair-reloaded');

  phase = 'public-asset';
  await writeFile(publicProbe, 'asset-two\n');
  const updatedPublicAsset = await fetch(`${origin}/acceptance/probe.txt?revision=2`);
  assert.equal(updatedPublicAsset.status, 200);
  assert.equal(await updatedPublicAsset.text(), 'asset-two\n');
  record('public-asset-edit-served-current-bytes-without-autoreload-claim');

  phase = 'delete';
  const deletedReload = observeWait(page.waitForEvent('load', { timeout: 60_000 }));
  await rm(dynamicPage);
  await rm(dynamicMarkdown);
  await waitFor(
    'dynamic route deletion',
    async () => !(await generatedRoutes()).includes("path: 'dynamic'"),
  );
  assert.equal(
    (await readFile(path.join(generated, 'assets/indexes.json'), 'utf8')).includes(
      'Edited guide browser marker.',
    ),
    false,
  );
  record('deleted-guide-physically-removed');
  await deletedReload();
  record('deleted-guide-announced-reload-completed', { url: page.url() });
  await navigateAndAssert(page, `${origin}/acceptance/dynamic`, 'Missing route');
  assert.equal(await page.getByText('Edited guide browser marker.', { exact: true }).count(), 0);
  assert.equal(await page.locator('ng-doc-page').count(), 0);
  record('deleted-guide-unreachable-and-stale-content-absent');

  phase = 'recreate';
  const recreatedReload = observeWait(page.waitForEvent('load', { timeout: 60_000 }));
  await writeFile(dynamicMarkdown, '# Dynamic guide\n\nRecreated guide browser marker.\n');
  await writeFile(dynamicPage, pageModule('dynamic', 'Dynamic guide'));
  await waitFor('recreated route publication', async () =>
    (await generatedRoutes()).includes("path: 'dynamic'"),
  );
  record('recreated-guide-physically-published');
  await recreatedReload();
  record('recreated-guide-announced-reload-completed', { url: page.url() });
  await navigateAndAssert(page, `${origin}/acceptance/dynamic`, 'Recreated guide browser marker.');
  record('deleted-guide-recreated-and-rendered');

  phase = 'final';
  await page.reload();
  await page.getByText('Recreated guide browser marker.', { exact: true }).waitFor();
  assert.deepEqual(
    summary.browserErrors.filter((error) => error.phase === 'final'),
    [],
  );
  assert.deepEqual(
    summary.httpErrors.filter((error) => error.phase === 'final'),
    [],
  );
  const indexes = await readFile(path.join(generated, 'assets/indexes.json'));
  assert.equal(indexes.includes(Buffer.from('Recreated guide browser marker.')), true);
  summary.output = {
    generatedIndex: existsSync(path.join(generated, 'index.ts')),
    searchSha256: createHash('sha256').update(indexes).digest('hex'),
  };
  summary.status = 'passed';
} catch (error) {
  summary.status = 'failed';
  summary.failure = error.stack ?? String(error);
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => undefined);
  await server?.close().catch(() => undefined);
  let fixtureRemoved = false;
  if (process.env.KEEP_NGDOC_VITE_BROWSER_FIXTURE !== '1') {
    await rm(fixture, { recursive: true, force: true });
    fixtureRemoved = !existsSync(fixture);
  }
  summary.cleanup = {
    browserClosed: browser ? !browser.isConnected() : true,
    serverClosed: server ? !server.httpServer?.listening : true,
    fixtureRemoved,
  };
  await writeFile(path.join(evidence, 'results.json'), `${JSON.stringify(summary, null, 2)}\n`);
  process.stdout.write(
    `${JSON.stringify({ status: summary.status, sourceDigest: summary.tuple.sourceDigest })}\n`,
  );
}
