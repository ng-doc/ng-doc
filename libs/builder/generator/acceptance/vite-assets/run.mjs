import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createNgDocAngularPlugins as angular } from '../../../../../dist/libs/builder/generator/vite/angular/index.js';
import { chromium } from '/Users/alex/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import { createServer } from 'vite';

const repository = fileURLToPath(new URL('../../../../../', import.meta.url));
const evidence = path.resolve(
  process.env.NGDOC_VITE_ASSETS_EVIDENCE ??
    path.join(repository, 'docs/architecture/evidence/t14/vite-assets'),
);
const expectedDigest = process.env.NGDOC_EXPECTED_SOURCE_DIGEST;
const fixture = await mkdtemp(path.join(repository, 'tmp/ngdoc-vite-assets-'));
const generated = path.join(fixture, 'generated');
const docs = path.join(fixture, 'docs');
const config = path.join(fixture, 'ng-doc.config.mjs');
const summary = { status: 'running', fixture, checks: [], errors: [], loads: [], gateEvents: [] };
let browser;
let server;
let phase = 'setup';
let releaseGate = () => undefined;
let gateReleased = false;

const waitFor = async (label, predicate, timeout = 90_000) => {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  throw new Error(`Timed out waiting for ${label}`);
};
const put = async (relative, value) => {
  const target = path.join(fixture, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, value);
  return target;
};
const digest = async (file) =>
  createHash('sha256')
    .update(await readFile(file))
    .digest('hex');
const manifest = async () =>
  JSON.parse(await readFile(path.join(generated, '.ng-doc-output-manifest.json'), 'utf8'));
const tsHashes = async () =>
  Object.fromEntries(
    await Promise.all(
      (await readdir(generated, { recursive: true }))
        .filter((file) => String(file).endsWith('.ts'))
        .map(async (file) => [String(file), await digest(path.join(generated, String(file)))]),
    ),
  );
const configSource = (keyword) =>
  `export default { docsPath: 'docs', tsConfig: 'tsconfig.json', routePrefix: '', cache: false, keywords: { keywords: { AssetOnly: { title: ${JSON.stringify(keyword)}, url: '/asset-only' } } } };\n`;

await mkdir(evidence, { recursive: true });
try {
  const provenance = JSON.parse(
    await readFile(
      path.join(repository, 'dist/libs/builder/generator/build-provenance.json'),
      'utf8',
    ),
  );
  assert.equal(provenance.sourceDigest, expectedDigest, 'Unexpected generator dist provenance');
  summary.provenance = provenance;
  const { createNgDocVitePlugin } = await import(
    pathToFileURL(path.join(repository, 'dist/libs/builder/generator/vite/index.js')).href
  );
  await put(
    'docs/ng-doc.page.ts',
    "const page = { title: 'Asset-only guide', route: 'asset-only', mdFile: './guide.md' }; export default page;\n",
  );
  const markdown = await put(
    'docs/guide.md',
    '# Asset-only guide\n\nInitial TypeScript generation marker.\n',
  );
  await writeFile(config, configSource('asset-initial'));
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
          skipLibCheck: true,
          paths: {
            '@ng-doc/generated': [path.join(generated, 'index.ts')],
            '@ng-doc/generated/*': [path.join(generated, '*')],
          },
        },
        angularCompilerOptions: { strictTemplates: true },
        include: ['src/**/*.ts', 'docs/**/*.ts', 'generated/**/*.ts'],
      },
      null,
      2,
    ),
  );
  await put(
    'index.html',
    '<!doctype html><html><head><link rel="icon" href="data:,"></head><body><app-root></app-root><script type="module" src="/src/main.ts"></script></body></html>',
  );
  await put(
    'src/main.ts',
    "import 'zone.js'; import {Component, provideZoneChangeDetection, signal} from '@angular/core'; import {bootstrapApplication} from '@angular/platform-browser'; import {NG_DOC_ROUTING} from '@ng-doc/generated'; @Component({selector:'app-root',standalone:true,template:'<p>{{value()}}</p>'}) class App { value=signal('loading'); async ngOnInit(){ this.value.set(await fetch('/assets/ng-doc/keywords.json').then((response)=>response.text())); } } void NG_DOC_ROUTING; bootstrapApplication(App,{providers:[provideZoneChangeDetection()]});\n",
  );
  assert.equal(
    existsSync(path.join(fixture, 'public/assets/ng-doc/keywords.json')),
    false,
    'Fixture must not use a Vite public generated asset',
  );

  let gateArmed = false;
  const gate = new Promise((resolve) => {
    releaseGate = resolve;
  });
  const gatePlugin = {
    name: 'ng-doc-assets-ts-prehook',
    enforce: 'pre',
    hotUpdate: {
      order: 'pre',
      async handler(context) {
        if (
          !gateArmed ||
          !context.file.startsWith(`${generated}${path.sep}`) ||
          !/\.[cm]?ts$/.test(context.file)
        )
          return;
        summary.gateEvents.push({ file: context.file, type: context.type, at: Date.now() });
        await gate;
      },
    },
  };
  const linkedCoreImports = new Set(['@ng-doc/core']);
  for (const library of ['app', 'ui-kit']) {
    const fesm = path.join(repository, `dist/libs/${library}/fesm2022`);
    if (!existsSync(fesm)) continue;
    for (const file of await readdir(fesm)) {
      if (!file.endsWith('.mjs')) continue;
      const code = await readFile(path.join(fesm, file), 'utf8');
      for (const match of code.matchAll(/['"](@ng-doc\/core(?:\/[^'"]*)?)['"]/g))
        linkedCoreImports.add(match[1]);
    }
  }
  const ngDocPlugins = createNgDocVitePlugin({
    analogLiveReload: true,
    angularPlugins: angular({
      tsconfig,
      workspaceRoot: fixture,
      disableTypeChecking: false,
      jit: false,
      liveReload: true,
    }),
    angularComponentProbe: path.join(fixture, 'src/main.ts'),
    generator: {
      projectId: 'vite-assets',
      workspaceRoot: fixture,
      configFile: config,
      defaults: {
        docsRoot: docs,
        tsConfig: tsconfig,
        outputRoot: generated,
        cacheRoot: path.join(fixture, 'cache'),
      },
      session: { batchDelayMs: 5 },
    },
  });
  server = await createServer({
    root: fixture,
    cacheDir: path.join(fixture, 'vite-cache'),
    configFile: false,
    logLevel: 'warn',
    plugins: [ngDocPlugins, gatePlugin],
    optimizeDeps: { include: [...linkedCoreImports].sort() },
    resolve: {
      alias: [
        { find: '@ng-doc/app', replacement: path.join(repository, 'dist/libs/app') },
        { find: '@ng-doc/core', replacement: path.join(repository, 'dist/libs/core') },
        { find: '@ng-doc/ui-kit', replacement: path.join(repository, 'dist/libs/ui-kit') },
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
  page.on('load', () => summary.loads.push({ at: Date.now(), url: page.url() }));
  page.on('pageerror', (error) =>
    summary.errors.push({ phase, kind: 'pageerror', message: error.message }),
  );
  page.on('console', (event) => {
    if (event.type() === 'error')
      summary.errors.push({ phase, kind: 'console', message: event.text() });
  });
  page.on('response', (response) => {
    if (response.status() >= 400)
      summary.errors.push({ phase, kind: 'http', status: response.status(), url: response.url() });
  });
  phase = 'initial';
  await page.goto(origin);
  await page.getByText(/asset-initial/).waitFor({ timeout: 90_000 });
  assert.deepEqual(
    summary.errors.filter((error) => error.phase === 'initial'),
    [],
    'Initial Angular browser phase was unhealthy',
  );
  const initialManifest = await manifest();
  const initialTs = await tsHashes();
  summary.initial = { manifest: initialManifest.files, ts: initialTs };
  summary.checks.push(
    'Chrome consumed generated keywords.json through NgDoc middleware with no public generated asset',
  );

  phase = 'asset-held';
  gateArmed = true;
  await writeFile(markdown, '# Asset-only guide\n\nHeld generated TypeScript marker.\n');
  await waitFor('held generated TypeScript prehook', () => summary.gateEvents.length > 0);
  const heldTs = await tsHashes();
  assert.notDeepEqual(
    heldTs,
    initialTs,
    'Held Markdown update did not change generated TypeScript bytes',
  );
  assert.match(
    await readFile(path.join(generated, 'guides/index/page.ts'), 'utf8'),
    /Held generated TypeScript marker/,
  );
  const loadsBeforeAssetCommit = summary.loads.length;
  await writeFile(config, configSource('asset-updated'));
  await waitFor('asset-only keywords publication', async () =>
    (await readFile(path.join(generated, 'assets/keywords.json'), 'utf8')).includes(
      'asset-updated',
    ),
  );
  const assetManifest = await manifest();
  const assetTs = await tsHashes();
  const heldObservationMs = 500;
  await new Promise((resolve) => setTimeout(resolve, heldObservationMs));
  assert.deepEqual(
    assetTs,
    heldTs,
    'Asset-only next generation changed generated TypeScript bytes',
  );
  assert.equal(
    summary.loads.length,
    loadsBeforeAssetCommit,
    'Adapter reloaded before the held TypeScript prehook released',
  );
  summary.race = {
    heldObservationMs,
    loadsBeforeAssetCommit,
    loadsAtAssetCommit: summary.loads.length,
    initialManifest,
    assetManifest,
    heldTs,
    assetTs,
  };
  const nativeReload = page.waitForEvent('load', { timeout: 90_000 });
  try {
    releaseGate();
    gateReleased = true;
    gateArmed = false;
    await nativeReload;
  } finally {
    releaseGate();
    gateReleased = true;
    gateArmed = false;
  }
  phase = 'released';
  await page.getByText(/asset-updated/).waitFor({ timeout: 90_000 });
  assert.deepEqual(
    summary.errors.filter((error) => error.phase === 'asset-held' || error.phase === 'released'),
    [],
    'Asset browser phases were unhealthy',
  );
  assert.notDeepEqual(
    initialManifest.files,
    assetManifest.files,
    'Manifest did not record the asset-only generation',
  );
  summary.checks.push(
    'Asset-only generation waited for the prior generated TypeScript prehook, then native browser reload displayed the new middleware asset content',
  );
  assert.deepEqual(summary.errors, [], 'Browser run recorded an unexpected error');
  summary.status = 'passed';
} catch (error) {
  summary.status = 'failed';
  summary.errors.push(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
} finally {
  if (!gateReleased) releaseGate();
  await browser?.close().catch(() => undefined);
  await server?.close().catch(() => undefined);
  if (process.env.KEEP_NGDOC_VITE_ASSETS_FIXTURE !== '1')
    await rm(fixture, { recursive: true, force: true });
  summary.cleanup = {
    browserClosed: browser ? !browser.isConnected() : true,
    serverClosed: server ? !server.httpServer?.listening : true,
    fixtureRemoved: !existsSync(fixture),
  };
  await writeFile(path.join(evidence, 'results.json'), JSON.stringify(summary, null, 2) + '\n');
  console.log(
    JSON.stringify({ status: summary.status, sourceDigest: summary.provenance?.sourceDigest }),
  );
}
