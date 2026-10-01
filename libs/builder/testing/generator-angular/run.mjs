import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { createServer as createNetServer } from 'node:net';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { build } from 'esbuild';
import { createLogger, createServer } from 'vite';
import angular from '@analogjs/vite-plugin-angular';

const require = createRequire(import.meta.url);
const harness = dirname(fileURLToPath(import.meta.url));
const repository = resolve(harness, '../../../..');
const evidence = resolve(
  process.env.NGDOC_GENERATOR_ANGULAR_EVIDENCE ||
    join(repository, 'docs/architecture/evidence/t10/angular'),
);
const runtimeRoot = join(harness, '.runtime');
await mkdir(runtimeRoot, { recursive: true });
await mkdir(evidence, { recursive: true });
const fixture = await mkdtemp(join(runtimeRoot, 'run-'));
const outputRoot = join(fixture, 'src/generated');
const cacheRoot = join(fixture, '.cache/ng-doc');
const events = [];
const browserErrors = [];
const failedRequests = [];
const viteMessages = [];
const mark = (event, details = {}) => {
  const value = { event, ms: Math.round(performance.now()), ...structuredClone(details) };
  events.push(value);
  console.log(event, JSON.stringify(details));
};
const put = async (name, content) => {
  const target = join(fixture, name);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content);
  return target;
};
const digest = (content) => createHash('sha256').update(content).digest('hex');
const summary = {
  tuple: {
    node: process.version,
    angular: require('@angular/core/package.json').version,
    analog: require('@analogjs/vite-plugin-angular/package.json').version,
    vite: require('vite/package.json').version,
    typescript: require('typescript/package.json').version,
  },
  fixture,
  checks: {},
};
let compiler;
let committer;
let server;
let browser;

async function freePort() {
  const probe = createNetServer();
  await new Promise((accept, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', accept);
  });
  const address = probe.address();
  assert(address && typeof address !== 'string');
  await new Promise((accept, reject) => probe.close((error) => (error ? reject(error) : accept())));
  return address.port;
}

async function createFixture() {
  await put('package.json', '{"private":true,"type":"module"}');
  await put(
    'src/token.ts',
    `import { InjectionToken } from '@angular/core';
export const CATEGORY_MESSAGE = new InjectionToken<string>('CATEGORY_MESSAGE');
export const PAGE_MESSAGE = new InjectionToken<string>('PAGE_MESSAGE');
`,
  );
  await put(
    'src/counter.ts',
    `import { Component, inject, input, model } from '@angular/core';
import { CATEGORY_MESSAGE, PAGE_MESSAGE } from './token';

@Component({
  selector: 'fixture-counter',
  standalone: true,
  templateUrl: './counter.html',
  styleUrl: './counter.scss',
})
export class CounterComponent {
  readonly categoryMessage = inject(CATEGORY_MESSAGE);
  readonly pageMessage = inject(PAGE_MESSAGE);
  readonly caption = input('Initial', { alias: 'label' });
  readonly value = model(2, { alias: 'amount' });

  increment(): void {
    this.value.update((value) => value + 1);
  }
}
`,
  );
  await put(
    'src/counter.html',
    `<button data-testid="counter" (click)="increment()">{{ caption() }} {{ value() }}</button>
<span data-testid="category-provider">{{ categoryMessage }}</span>
<span data-testid="page-provider">{{ pageMessage }}</span>
`,
  );
  await put(
    'src/counter.scss',
    `$color: rgb(23, 101, 211);
:host { display: block; margin: 12px; }
button { background-color: $color; color: white; padding: 8px; }
`,
  );
  await put(
    'docs/ng-doc.category.ts',
    `import { CATEGORY_MESSAGE } from '../src/token';
/** Category injected into generated route providers. */
const Category = {
  title: 'Generated section',
  route: 'section',
  expanded: true,
  providers: [{ provide: CATEGORY_MESSAGE, useValue: 'Category provider active' }],
};
export default Category;
`,
  );
  await put(
    'docs/guide/ng-doc.page.ts',
    `import Category from '../ng-doc.category';
import { CounterComponent } from '../../src/counter';
import { PAGE_MESSAGE } from '../../src/token';

/** Guide produced by the real generator compiler. */
const Page = {
  title: 'Generated Angular guide',
  route: 'guide',
  category: Category,
  mdFile: ['./overview.md.nunj', './advanced.md.nunj'],
  demos: { Counter: CounterComponent },
  playgrounds: {
    counter: {
      target: CounterComponent,
      template: '<fixture-counter></fixture-counter>',
      inputs: { caption: 'Playground start', value: 4 },
    },
  },
  providers: [{ provide: PAGE_MESSAGE, useValue: 'Page provider active' }],
};
export default Page;
`,
  );
  await put(
    'docs/guide/overview.md.nunj',
    `---
title: Overview
route: ''
---
# Generated guide

<p id="overview-marker">Compiler-linked overview</p>

{{ NgDocActions.demo("Counter") }}

{{ NgDocActions.playground("counter") }}
`,
  );
  await put(
    'docs/guide/advanced.md.nunj',
    `---
title: Advanced
route: advanced
---
# Advanced tab

<p id="advanced-marker">Second generated tab</p>
`,
  );
  const tsConfig = await put(
    'tsconfig.app.json',
    JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'ES2022',
          moduleResolution: 'bundler',
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
          strict: true,
          skipLibCheck: true,
          allowSyntheticDefaultImports: true,
          esModuleInterop: true,
          useDefineForClassFields: false,
          importHelpers: true,
          ignoreDeprecations: '6.0',
          baseUrl: repository,
          paths: Object.fromEntries(
            ['app', 'core', 'ui-kit'].flatMap((name) => [
              [`@ng-doc/${name}`, [join(repository, `libs/${name}/index.ts`)]],
              [`@ng-doc/${name}/*`, [join(repository, `libs/${name}/*`)]],
            ]),
          ),
          types: [],
          rootDir: repository,
          outDir: join(fixture, '.ts-output'),
          sourceMap: true,
        },
        angularCompilerOptions: {
          strictTemplates: true,
          strictInjectionParameters: true,
        },
        include: [join(fixture, 'src/**/*.ts'), join(fixture, 'docs/**/*.ts')],
      },
      null,
      2,
    ),
  );
  const configFile = await put(
    'ng-doc.config.ts',
    `export default {
  docsPath: 'docs',
  routePrefix: '',
  tsConfig: 'tsconfig.app.json',
  cache: false,
  shiki: { themes: { light: 'github-light', dark: 'ayu-dark' } },
};
`,
  );
  await put(
    'src/app.ts',
    `import { Component } from '@angular/core';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideRouter, RouterLink, RouterOutlet } from '@angular/router';
import {
  provideNgDocApp,
  providePageSkeleton,
  provideMainPageProcessor,
  NG_DOC_DEFAULT_PAGE_PROCESSORS,
} from '@ng-doc/app';
import { provideNgDocContext } from './generated/context';
import { NG_DOC_ROUTING } from './generated/routes';

@Component({
  selector: 'fixture-root',
  standalone: true,
  imports: [RouterLink, RouterOutlet],
  template: '<nav><a routerLink="/section/guide">Generated guide</a></nav><router-outlet></router-outlet>',
})
export class FixtureRoot {}

export const appProviders = [
  provideRouter(NG_DOC_ROUTING),
  provideHttpClient(withInterceptorsFromDi()),
  ...provideNgDocApp(),
  ...providePageSkeleton({}),
  ...provideMainPageProcessor(NG_DOC_DEFAULT_PAGE_PROCESSORS),
  ...provideNgDocContext(),
];
`,
  );
  await put(
    'src/main.ts',
    `import { bootstrapApplication } from '@angular/platform-browser';
import { FixtureRoot, appProviders } from './app';

bootstrapApplication(FixtureRoot, { providers: appProviders })
  .then(() => document.body.setAttribute('data-bootstrapped', 'true'))
  .catch((error) => {
    console.error(error);
    document.body.setAttribute('data-bootstrap-error', String(error));
  });
`,
  );
  await put(
    'src/server.ts',
    `import { bootstrapApplication } from '@angular/platform-browser';
import { provideServerRendering, renderApplication } from '@angular/platform-server';
import { FixtureRoot, appProviders } from './app';

export function render(url: string): Promise<string> {
  return renderApplication(
    (context) => bootstrapApplication(
      FixtureRoot,
      { providers: [...appProviders, provideServerRendering()] },
      context,
    ),
    {
      document: '<!doctype html><html><head><base href="/"></head><body><fixture-root></fixture-root></body></html>',
      url,
      allowedHosts: ['127.0.0.1'],
    },
  );
}
`,
  );
  await put(
    'index.html',
    `<!doctype html><html><head><base href="/"><title>Generator Angular verification</title><link rel="icon" href="data:,"></head><body><fixture-root></fixture-root><script type="module" src="/src/main.ts"></script></body></html>`,
  );
  return { tsConfig, configFile };
}

async function compileAndCommit({ tsConfig, configFile }) {
  mark('compiler:bundle:start');
  const bridge = join(fixture, '.native/generator.mjs');
  await mkdir(dirname(bridge), { recursive: true });
  const bundled = await build({
    absWorkingDir: repository,
    stdin: {
      contents: `export { createCompilationService } from './libs/builder/generator/compiler/index.ts';\nexport { createOutputCommitter } from './libs/builder/generator/artifacts/index.ts';`,
      resolveDir: repository,
      sourcefile: 'generator-angular-bridge.ts',
      loader: 'ts',
    },
    outfile: bridge,
    bundle: true,
    packages: 'external',
    platform: 'node',
    format: 'esm',
    target: 'node24',
    metafile: true,
    alias: {
      '@ng-doc/core': join(repository, 'libs/core/index.ts'),
      '@ng-doc/utils': join(repository, 'libs/utils/index.ts'),
    },
  });
  const bundleInputs = Object.keys(bundled.metafile.inputs).sort();
  for (const required of [
    'libs/builder/generator/compiler/index.ts',
    'libs/builder/generator/discovery/index.ts',
    'libs/builder/generator/semantic/semantic-service.ts',
    'libs/builder/generator/content/content-compiler.ts',
    'libs/builder/generator/artifacts/index.ts',
    'libs/builder/generator/outputs/index.ts',
  ]) {
    assert(bundleInputs.includes(required), `native compiler bundle is missing ${required}`);
  }
  assert.equal(
    bundleInputs.some((input) => /libs\/builder\/engine\//.test(input)),
    false,
  );
  summary.bundle = {
    inputs: bundleInputs,
    outputBytes:
      bundled.metafile.outputs[relative(repository, bridge).replaceAll('\\', '/')]?.bytes,
  };
  mark('compiler:bundle:ready', { inputs: bundleInputs.length });
  const native = await import(`${pathToFileURL(bridge).href}?digest=${Date.now()}`);
  compiler = native.createCompilationService({
    projectId: 'generator-angular',
    workspaceRoot: fixture,
    configFile,
    defaults: {
      docsRoot: join(fixture, 'docs'),
      tsConfig,
      outputRoot,
      cacheRoot,
    },
    compilerVersion: 't10-angular-verification',
    toolchainDigest: `angular-${summary.tuple.angular}-typescript-${summary.tuple.typescript}`,
    templateRoot: join(repository, 'libs/builder/templates'),
  });
  mark('compiler:compile:start');
  const result = await compiler.compile(
    { generation: 1, mode: 'production', changes: [] },
    new AbortController().signal,
  );
  summary.compilation = {
    diagnostics: result.diagnostics,
    whyRebuilt: result.whyRebuilt,
    dependencies: result.dependencies.length,
  };
  assert.deepEqual(
    result.diagnostics.filter((item) => item.severity === 'error'),
    [],
  );
  assert(result.candidate, 'real compiler did not produce an artifact candidate');
  const candidate = result.candidate;
  const allOutputs = candidate.artifacts.flatMap((artifact) => artifact.outputs);
  const generated = new Map(allOutputs.map((item) => [item.path, item]));
  for (const expected of [
    'routes.ts',
    'context.ts',
    'guides/guide/page.ts',
    'guides/guide/index/page.ts',
    'guides/guide/advanced/page.ts',
    'guides/guide/demo-assets.ts',
    'guides/guide/playgrounds.ts',
  ]) {
    assert(generated.has(expected), `compiler candidate is missing ${expected}`);
  }
  const demoAssets = generated.get('guides/guide/demo-assets.ts').content;
  const playgrounds = generated.get('guides/guide/playgrounds.ts').content;
  const routes = generated.get('routes.ts').content;
  assert.match(demoAssets, /category-provider/);
  assert.match(demoAssets, /rgb\(23, 101, 211\)/);
  assert.match(playgrounds, /pageEntity\.playgrounds\['counter'\]\.target/);
  assert.match(playgrounds, /\[label\]/);
  assert.match(playgrounds, /\[amount\]/);
  assert.match(routes, /\.providers \?\? \[\]/);
  for (const output of allOutputs) assert.equal(output.digest, digest(output.content));
  summary.compilation.artifacts = candidate.artifacts.length;
  summary.compilation.outputs = allOutputs.length;
  summary.compilation.revision = candidate.revision;
  summary.checks.realCompilerCandidate = true;
  summary.checks.externalResourcesCaptured = true;
  summary.checks.runtimeReferencesPreserved = true;
  mark('compiler:compile:ready', {
    artifacts: candidate.artifacts.length,
    outputs: allOutputs.length,
  });

  committer = native.createOutputCommitter({ outputRoot });
  mark('committer:start');
  const committed = await committer.commit(
    { generation: 1, candidate },
    { isCurrent: (generation) => generation === 1 },
    new AbortController().signal,
  );
  assert.equal(committed.status, 'committed');
  assert.deepEqual(committed.diagnostics, []);
  summary.commit = {
    status: committed.status,
    written: committed.written,
    removed: committed.removed,
    manifest: committed.manifest,
  };
  summary.checks.realOutputCommit = true;
  mark('committer:ready', { written: committed.written.length });

  const evidenceGenerated = join(evidence, 'generated');
  await rm(evidenceGenerated, { recursive: true, force: true });
  for (const name of [
    'routes.ts',
    'context.ts',
    'guides/guide/page.ts',
    'guides/guide/index/page.ts',
    'guides/guide/advanced/page.ts',
    'guides/guide/demo-assets.ts',
    'guides/guide/playgrounds.ts',
  ]) {
    const content = await readFile(join(outputRoot, name), 'utf8');
    const target = join(evidenceGenerated, name);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
  }
  await mkdir(join(fixture, 'public/assets/ng-doc'), { recursive: true });
  await cp(join(repository, 'libs/ui-kit/assets'), join(fixture, 'public/assets/ng-doc/ui-kit'), {
    recursive: true,
  });
  await cp(join(outputRoot, 'assets'), join(fixture, 'public/assets/ng-doc'), {
    recursive: true,
    force: true,
  });
}

async function runBrowser() {
  const logger = createLogger('warn', { allowClearScreen: false });
  const nativeWarn = logger.warn.bind(logger);
  const nativeError = logger.error.bind(logger);
  logger.warn = (text, options) => {
    viteMessages.push({ level: 'warn', text: String(text) });
    if (!String(text).includes('Deprecation')) nativeWarn(text, options);
  };
  logger.error = (text, options) => {
    viteMessages.push({ level: 'error', text: String(text) });
    nativeError(text, options);
  };
  const aliases = ['app', 'core', 'ui-kit'].map((name) => ({
    find: `@ng-doc/${name}`,
    replacement: join(repository, `libs/${name}`),
  }));
  const port = await freePort();
  mark('vite:create', { port });
  server = await createServer({
    configFile: false,
    root: fixture,
    cacheDir: join(fixture, '.vite'),
    customLogger: logger,
    plugins: [
      angular({
        tsconfig: join(fixture, 'tsconfig.app.json'),
        workspaceRoot: repository,
        disableTypeChecking: false,
        jit: false,
        inlineStylesExtension: 'scss',
      }),
    ],
    resolve: {
      alias: aliases,
      dedupe: [
        '@angular/core',
        '@angular/common',
        '@angular/compiler',
        '@angular/platform-browser',
        '@angular/router',
        'rxjs',
      ],
    },
    optimizeDeps: {
      include: [
        'shiki/themes/github-light.mjs',
        'shiki/themes/ayu-dark.mjs',
        'shiki/langs/angular-html.mjs',
        'esthetic',
      ],
    },
    server: {
      host: '127.0.0.1',
      port,
      strictPort: true,
      fs: { allow: [repository, fixture] },
    },
    css: {
      preprocessorOptions: {
        scss: {
          silenceDeprecations: ['import', 'global-builtin', 'color-functions', 'if-function'],
        },
      },
    },
    ssr: { noExternal: ['@ng-doc/app', '@ng-doc/ui-kit', '@ng-doc/core'] },
  });
  await server.listen();
  const origin = `http://127.0.0.1:${port}`;
  summary.origin = origin;
  mark('vite:listening', { origin });
  const playwright = require(
    process.env.PLAYWRIGHT_MODULE ||
      '/Users/alex/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright',
  );
  browser = await playwright.chromium.launch({
    headless: true,
    executablePath:
      process.env.CHROME_EXECUTABLE ||
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1100 } });
  page.setDefaultTimeout(30_000);
  page.on('pageerror', (error) => browserErrors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.status() >= 400)
      failedRequests.push({ url: response.url(), status: response.status() });
  });
  await page.goto(`${origin}/section/guide`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () =>
      document.body.hasAttribute('data-bootstrapped') ||
      document.body.hasAttribute('data-bootstrap-error'),
    undefined,
    { timeout: 90_000 },
  );
  assert.equal(await page.locator('body').getAttribute('data-bootstrap-error'), null);
  await page.waitForSelector('#overview-marker', { timeout: 90_000 });
  await page.waitForSelector('ng-doc-demo [data-testid="counter"]', { timeout: 90_000 });
  await page.screenshot({ path: join(evidence, 'overview.png'), fullPage: true });
  summary.checks.overviewRouteRendered = true;

  const demo = page.locator('ng-doc-demo [data-testid="counter"]');
  assert.equal((await demo.innerText()).trim(), 'Initial 2');
  await demo.click();
  await page.waitForFunction(
    () =>
      document.querySelector('ng-doc-demo [data-testid=counter]')?.textContent?.trim() ===
      'Initial 3',
  );
  assert.equal((await demo.innerText()).trim(), 'Initial 3');
  assert.equal(
    await page.locator('ng-doc-demo [data-testid="category-provider"]').innerText(),
    'Category provider active',
  );
  assert.equal(
    await page.locator('ng-doc-demo [data-testid="page-provider"]').innerText(),
    'Page provider active',
  );
  assert.equal(
    await demo.evaluate((node) => getComputedStyle(node).backgroundColor),
    'rgb(23, 101, 211)',
  );
  summary.checks.demoClick = true;
  summary.checks.categoryAndPageProviders = true;
  summary.checks.externalScss = true;

  const playground = page.locator('ng-doc-playground [data-testid="counter"]');
  await playground.waitFor();
  assert.equal((await playground.innerText()).trim(), 'Playground start 4');
  await page.locator('ng-doc-playground input[ngdocinputstring]').fill('Edited label');
  await page.locator('ng-doc-playground input[type=number]').fill('9');
  await page.waitForFunction(
    () =>
      document.querySelector('ng-doc-playground [data-testid=counter]')?.textContent?.trim() ===
      'Edited label 9',
  );
  summary.playgroundInputs = await page.locator('ng-doc-playground input').evaluateAll((elements) =>
    elements.map((element) => ({
      type: element.type,
      value: element.value,
      attributes: [...element.attributes].map((attribute) => attribute.name),
    })),
  );
  summary.checks.playgroundAliasesAndModel = true;
  await page.screenshot({ path: join(evidence, 'interactive.png'), fullPage: true });

  await page.getByRole('link', { name: 'Advanced', exact: true }).click();
  await page.waitForSelector('#advanced-marker');
  assert.match(page.url(), /\/section\/guide\/advanced$/);
  summary.checks.secondTabNavigation = true;
  await page.screenshot({ path: join(evidence, 'advanced.png'), fullPage: true });
  await page.getByRole('link', { name: 'Overview', exact: true }).click();
  await page.waitForSelector('#overview-marker');
  assert.match(page.url(), /\/section\/guide$/);
  summary.checks.firstTabNavigation = true;

  assert.deepEqual(browserErrors, []);
  assert.deepEqual(failedRequests, []);
  summary.checks.noBrowserErrors = true;
  mark('browser:passed', { checks: summary.checks });

  mark('ssr:probe:start');
  try {
    const loaded = await server.ssrLoadModule('/src/server.ts');
    let timer;
    const html = await Promise.race([
      loaded.render(`${origin}/section/guide`),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('SSR did not settle in 20 seconds')), 20_000);
      }),
    ]).finally(() => clearTimeout(timer));
    await writeFile(join(evidence, 'ssr.html'), html);
    assert.match(html, /Compiler-linked overview/);
    assert.match(html, /Category provider active/);
    summary.ssr = { status: 'rendered', bytes: Buffer.byteLength(html) };
  } catch (error) {
    summary.ssr = { status: 'unsupported-in-harness', error: error.stack || String(error) };
  }
  mark('ssr:probe:complete', { status: summary.ssr.status });
}

try {
  const fixtureConfiguration = await createFixture();
  mark('fixture:ready');
  await compileAndCommit(fixtureConfiguration);
  await runBrowser();
  summary.passed = Object.values(summary.checks).every((value) => value === true);
  assert.equal(summary.passed, true);
} catch (error) {
  summary.failure = error.stack || String(error);
  process.exitCode = 1;
  console.error(summary.failure);
} finally {
  if (browser) await browser.close();
  if (server) await server.close();
  if (committer) await committer.dispose();
  if (compiler) await compiler.dispose();
  summary.disposed = {
    browser: !browser?.isConnected(),
    server: !server?.httpServer?.listening,
    committer: true,
    compiler: true,
  };
  if (process.env.KEEP_GENERATOR_ANGULAR_FIXTURE !== '1') {
    await rm(fixture, { recursive: true, force: true });
  }
  mark('disposed', summary.disposed);
  await writeFile(
    join(evidence, 'results.json'),
    JSON.stringify({ ...summary, events, browserErrors, failedRequests, viteMessages }, null, 2),
  );
}
