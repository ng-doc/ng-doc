import { mkdir, mkdtemp, readFile, writeFile, cp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
import { createServer as createNetServer } from 'node:net';
import assert from 'node:assert/strict';
import { createServer, createLogger } from 'vite';
import angular from '@analogjs/vite-plugin-angular';
import nunjucks from 'nunjucks';

const require = createRequire(import.meta.url);
const spike = dirname(fileURLToPath(import.meta.url));
const workspace = resolve(spike, '../../../..');
const omitDynamicPrebundle = process.argv.includes('--without-dynamic-prebundle');
const unsynchronizedAdd = process.argv.includes('--unsynchronized-add');
const evidence = resolve(
  process.env.NGDOC_SPIKE_EVIDENCE || resolve(workspace, 'docs/architecture/evidence/t13'),
  omitDynamicPrebundle ? 'unprimed' : unsynchronizedAdd ? 'unsynchronized-add' : '.',
);
const runtimeRoot = join(spike, '.runtime');
await mkdir(runtimeRoot, { recursive: true });
await mkdir(evidence, { recursive: true });
const fixture = await mkdtemp(join(runtimeRoot, 'run-'));
const events = [];
const messages = [];
const errors = [];
const requests = [];
const mark = (event, details = {}) => {
  events.push({ event, ms: Math.round(performance.now()), ...structuredClone(details) });
  console.log(event, JSON.stringify(details));
};
const put = async (name, text) => {
  const path = join(fixture, name);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text);
  return path;
};
const toImport = (from, path) => {
  const name = relative(from, path).replaceAll('\\', '/').replace(/\.ts$/, '');
  return name.startsWith('.') ? name : './' + name;
};
const env = new nunjucks.Environment(
  new nunjucks.FileSystemLoader(join(workspace, 'libs/builder/templates'), { noCache: true }),
  { autoescape: false },
);
env.addFilter('createImportPath', toImport);
env.addFilter('toTemplateString', (value) =>
  String(value).replaceAll('\\', '\\\\').replaceAll('`', '\\`').replaceAll('${', '\\${'),
);
const properties = {
  caption: { type: 'string', inputName: 'label', description: 'Visible label' },
  value: { type: 'number', inputName: 'amount', description: 'Counter value' },
};
const content = `<p id="guide-content">Generated guide content</p><ng-doc-demo componentName="Counter"><script id="options" type="application/json">{"container":false}</script></ng-doc-demo><ng-doc-playground id="counter"><script id="data" type="application/json">${JSON.stringify(properties)}</script><script id="selectors" type="text/plain">fixture-counter</script><script id="options" type="application/json">{}</script></ng-doc-playground>`;
async function generatePage(name, title, pageContent = content) {
  const output = join(fixture, 'src/generated', name);
  await mkdir(output, { recursive: true });
  const playgrounds = env.render('playgrounds.ts.nunj', {
    entryImportPath: toImport(output, join(fixture, 'src/page-entry.ts')),
    hasImports: false,
    playgroundMetadata: {
      counter: {
        standalone: true,
        templateForComponents: {
          'fixture-counter':
            '<fixture-counter [label]="properties.caption" [amount]="properties.value"></fixture-counter>',
        },
      },
    },
  });
  await writeFile(join(output, 'playgrounds.ts'), playgrounds);
  await writeFile(
    join(output, 'page.ts'),
    env.render('page.ts.nunj', {
      id: name,
      metadata: { outDir: output, title },
      entryPath: join(fixture, 'src/page-entry.ts'),
      entryHasImports: false,
      playgroundsPath: join(output, 'playgrounds.ts'),
      content: pageContent,
      pageType: 'guide',
    }),
  );
  await writeFile(
    join(output, 'wrapper.ts'),
    env.render('page-wrapper.ts.nunj', {
      id: name,
      metadata: { title },
      pageType: 'guide',
      hasBreadcrumb: false,
      headerContent: `<h1>${title}</h1>`,
      entries: { page: { route: '', title: 'Overview', entry: {} } },
    }),
  );
}
async function manifest(names) {
  await put(
    'src/generated/routes.ts',
    `import type { Routes } from '@angular/router';\nexport const routes: Routes = [{path:'',redirectTo:'first',pathMatch:'full'},${names.map((name) => `{path:'${name}',loadChildren:()=>import('./${name}/wrapper')}`).join(',')}];\n`,
  );
}
await put('package.json', '{"private":true,"type":"module"}');
await cp(join(spike, 'fixture'), fixture, { recursive: true });
const paths = Object.fromEntries(
  ['app', 'core', 'ui-kit'].flatMap((name) => [
    [`@ng-doc/${name}`, [join(workspace, `libs/${name}/index.ts`)]],
    [`@ng-doc/${name}/*`, [join(workspace, `libs/${name}/*`)]],
  ]),
);
paths['@fixture/*'] = [join(fixture, 'src/*')];
await put(
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
        baseUrl: workspace,
        paths,
        types: [],
        rootDir: workspace,
        outDir: join(fixture, 'output'),
        sourceMap: true,
      },
      angularCompilerOptions: { strictTemplates: true, strictInjectionParameters: true },
      include: [join(fixture, 'src/**/*.ts')],
    },
    null,
    2,
  ),
);
await mkdir(join(fixture, 'public/assets/ng-doc'), { recursive: true });
await cp(join(workspace, 'libs/ui-kit/assets'), join(fixture, 'public/assets/ng-doc/ui-kit'), {
  recursive: true,
});
mark('generation:start', { fixture });
await generatePage('first', 'First generated guide');
await manifest(['first']);
mark('generation:ready');
const logger = createLogger('warn', { allowClearScreen: false });
const warn = logger.warn.bind(logger),
  error = logger.error.bind(logger);
logger.warn = (text, options) => {
  messages.push({ level: 'warn', text });
  if (!String(text).includes('Deprecation')) warn(text, options);
};
logger.error = (text, options) => {
  messages.push({ level: 'error', text });
  error(text, options);
};
const alias = [
  { find: /^@fixture\/(.*)$/, replacement: join(fixture, 'src/$1') },
  ...['app', 'core', 'ui-kit'].map((name) => ({
    find: `@ng-doc/${name}`,
    replacement: join(workspace, `libs/${name}`),
  })),
];
let server, browser;
const summary = {
  tuple: {
    node: process.version,
    vite: require('vite/package.json').version,
    analog: require('@analogjs/vite-plugin-angular/package.json').version,
    angular: require('@angular/core/package.json').version,
    typescript: require('typescript/package.json').version,
  },
  fixture,
  checks: {},
};
try {
  const probe = createNetServer();
  await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const freePort = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  mark('server:create');
  server = await createServer({
    configFile: false,
    root: fixture,
    cacheDir: join(fixture, '.vite'),
    customLogger: logger,
    plugins: [
      angular({
        tsconfig: join(fixture, 'tsconfig.app.json'),
        workspaceRoot: workspace,
        disableTypeChecking: false,
        jit: false,
        inlineStylesExtension: 'scss',
      }),
      {
        name: 'spike-order-observer',
        buildStart() {
          mark('angular-build-start-observed', {
            generatedManifest: existsSync(join(fixture, 'src/generated/routes.ts')),
          });
        },
      },
    ],
    resolve: {
      alias,
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
      include: omitDynamicPrebundle
        ? []
        : [
            'shiki/themes/github-light.mjs',
            'shiki/themes/ayu-dark.mjs',
            'shiki/langs/angular-html.mjs',
            'esthetic',
          ],
    },
    server: { host: '127.0.0.1', port: freePort, strictPort: true, fs: { allow: [workspace] } },
    css: {
      preprocessorOptions: {
        scss: {
          silenceDeprecations: ['import', 'global-builtin', 'color-functions', 'if-function'],
        },
      },
    },
    build: { outDir: join(fixture, 'build'), emptyOutDir: true },
    ssr: { noExternal: ['@ng-doc/app', '@ng-doc/ui-kit', '@ng-doc/core'] },
  });
  await server.listen();
  const port = server.httpServer.address().port;
  const origin = `http://127.0.0.1:${port}`;
  summary.origin = origin;
  mark('server:listening', { origin });
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
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  page.setDefaultTimeout(20000);
  page.on('pageerror', (error) => {
    errors.push(String(error));
    console.log('browser:error', String(error));
  });
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.status() >= 400) requests.push({ url: response.url(), status: response.status() });
  });
  const waitForBootstrap = async () => {
    await page.waitForFunction(
      () =>
        document.body.hasAttribute('data-bootstrapped') ||
        document.body.hasAttribute('data-bootstrap-error'),
      {},
      { timeout: 60000 },
    );
    assert.equal(await page.locator('body').getAttribute('data-bootstrap-error'), null);
  };
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await waitForBootstrap();
  await page.waitForSelector('[data-testid="counter"]', { timeout: 120000 });
  mark('browser:counter-visible');
  summary.body = await page.locator('body').innerText();
  await page.screenshot({ path: join(evidence, 'initial.png'), fullPage: true });
  const demo = page.locator('ng-doc-demo [data-testid="counter"]');
  assert.equal(await demo.innerText(), 'Initial 2');
  await demo.click();
  await page.waitForFunction(
    () => document.querySelector('ng-doc-demo [data-testid=counter]')?.textContent === 'Initial 3',
  );
  assert.equal(await demo.innerText(), 'Initial 3');
  summary.checks.demoClick = true;
  const playground = page.locator('ng-doc-playground [data-testid="counter"]');
  await playground.waitFor();
  assert.equal(await playground.innerText(), 'Playground start 4');
  summary.checks.playgroundRendered = true;
  summary.checks.providerAlias =
    (await page.locator('[data-testid="provider"]').first().innerText()) === 'Provided by entry';
  summary.checks.externalScss =
    (await demo.evaluate((el) => getComputedStyle(el).backgroundColor)) === 'rgb(23, 101, 211)';
  mark('browser:initial-runtime-passed', { checks: summary.checks });
  summary.inputs = await page
    .locator('ng-doc-playground input')
    .evaluateAll((elements) =>
      elements.map((el) => ({ type: el.type, value: el.value, outerHTML: el.outerHTML })),
    );
  await page.locator('ng-doc-playground input[ngdocinputstring]').fill('Edited label');
  await page.locator('ng-doc-playground input[type=number]').fill('9');
  await page.waitForFunction(
    () =>
      document.querySelector('ng-doc-playground [data-testid=counter]')?.textContent ===
      'Edited label 9',
  );
  summary.checks.playgroundControls = true;
  await page.screenshot({ path: join(evidence, 'interactive.png'), fullPage: true });
  const httpServer = server.httpServer;
  const awaitChange = (path, event = 'change') =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        server.watcher.off(event, onChange);
        reject(new Error('Watcher did not observe ' + path));
      }, 15000);
      const onChange = (changed) => {
        if (changed === path) {
          clearTimeout(timer);
          server.watcher.off(event, onChange);
          resolve();
        }
      };
      server.watcher.on(event, onChange);
    });
  const additions = (unsynchronizedAdd ? [] : ['playgrounds.ts', 'page.ts', 'wrapper.ts']).map(
    (name) => awaitChange(join(fixture, 'src/generated/second', name), 'add'),
  );
  const originalDocument = await page.evaluate(() => performance.timeOrigin);
  mark('generation:add-module');
  await generatePage(
    'second',
    'Second generated guide',
    content.replace('Generated guide content', 'New generated module while serving'),
  );
  await Promise.all(additions);
  const manifestChanged = unsynchronizedAdd
    ? Promise.resolve()
    : awaitChange(join(fixture, 'src/generated/routes.ts'));
  await manifest(['first', 'second']);
  await manifestChanged;
  // Wait for the native invalidation to expose the committed route before browser navigation.
  if (!unsynchronizedAdd) {
    const routesResponse = await fetch(origin + '/src/generated/routes.ts?t=' + Date.now());
    assert.match(await routesResponse.text(), /second\/wrapper/);
  }
  if (!unsynchronizedAdd) {
    // A transformed manifest does not settle Vite's scheduled browser reload.
    // Observe a different document whose completed Angular bootstrap imported the new routes.
    await page.waitForFunction(
      (previousDocument) =>
        performance.timeOrigin > previousDocument &&
        document.body.getAttribute('data-bootstrapped') === 'true' &&
        JSON.parse(document.body.getAttribute('data-route-paths') || '[]').includes('second'),
      originalDocument,
      { timeout: 60000 },
    );
    mark('browser:generated-reload-bootstrapped', {
      previousDocument: originalDocument,
      currentDocument: await page.evaluate(() => performance.timeOrigin),
      routes: await page.locator('body').getAttribute('data-route-paths'),
    });
    await page.getByRole('link', { name: 'Second', exact: true }).click();
  } else {
    await page.goto(origin + '/second', { waitUntil: 'domcontentloaded' });
    await waitForBootstrap();
  }
  await page.waitForFunction(
    () =>
      document.querySelector('#guide-content')?.textContent ===
      'New generated module while serving',
  );
  assert.equal(server.httpServer, httpServer);
  assert.equal(server.httpServer.address().port, port);
  summary.checks.newGeneratedModuleWithoutRestart = true;
  await page.locator('ng-doc-demo [data-testid=counter]').click();
  await page.waitForFunction(
    () => document.querySelector('ng-doc-demo [data-testid=counter]')?.textContent === 'Initial 3',
  );
  summary.checks.newModuleDemoInteractive = true;
  mark('browser:new-module-passed');
  let changed = awaitChange(join(fixture, 'src/counter.html'));
  await put(
    'src/counter.html',
    '<button data-testid="counter" (click)="increment()">Updated {{caption()}} {{value()}}</button><span data-testid="provider">{{message}}</span>',
  );
  await changed;
  changed = awaitChange(join(fixture, 'src/counter.scss'));
  await put(
    'src/counter.scss',
    '$color: rgb(199, 21, 88); :host { display:block; margin:12px; } button { background-color: $color; color:white; padding:8px; }',
  );
  await changed;
  await page.waitForFunction(
    () =>
      document
        .querySelector('ng-doc-demo [data-testid=counter]')
        ?.textContent?.startsWith('Updated Initial'),
    {},
    { timeout: 60000 },
  );
  await page.waitForFunction(
    () => {
      const button = document.querySelector('ng-doc-demo [data-testid=counter]');
      return button && getComputedStyle(button).backgroundColor === 'rgb(199, 21, 88)';
    },
    {},
    { timeout: 60000 },
  );
  summary.checks.externalTemplateAndStyleUpdateWithoutRestart = true;
  mark('browser:resource-updates-passed');
  await page.screenshot({ path: join(evidence, 'updated.png'), fullPage: true });
  summary.healthyBrowserErrors = [...errors];
  summary.healthyFailedRequests = [...requests];
  assert.deepEqual(errors, []);
  assert.deepEqual(requests, []);
  const counterPath = join(fixture, 'src/counter.ts');
  const validCounter = await readFile(counterPath, 'utf8');
  const beforeTypeRecovery = await page.evaluate(() => performance.timeOrigin);
  changed = awaitChange(counterPath);
  await put('src/counter.ts', validCounter + '\nexport const wrong: number = "type-error";\n');
  await changed;
  const bad = await fetch(origin + '/src/counter.ts?t=' + Date.now());
  const badText = await bad.text();
  summary.typeDiagnostic = { status: bad.status, body: badText };
  assert.equal(bad.status, 500);
  assert.match(badText, /not assignable to type 'number'/);
  summary.checks.typeDiagnostic = true;
  changed = awaitChange(counterPath);
  await put('src/counter.ts', validCounter);
  await changed;
  await page.waitForFunction(
    (before) =>
      performance.timeOrigin > before && document.body.getAttribute('data-bootstrapped') === 'true',
    beforeTypeRecovery,
    { timeout: 60000 },
  );
  await page.waitForFunction(
    () =>
      document.querySelector('ng-doc-demo [data-testid=counter]')?.textContent ===
      'Updated Initial 2',
  );
  summary.checks.typeErrorRecovery = true;
  mark('browser:diagnostic-recovery-passed');
  const templatePath = join(fixture, 'src/counter.html');
  const validTemplate = await readFile(templatePath, 'utf8');
  const beforeTemplateRecovery = await page.evaluate(() => performance.timeOrigin);
  changed = awaitChange(templatePath);
  await put('src/counter.html', validTemplate + '<p>{{doesNotExist}}</p>');
  await changed;
  const badTemplate = await fetch(origin + '/src/counter.ts?t=' + Date.now());
  const badTemplateText = await badTemplate.text();
  summary.templateDiagnostic = { status: badTemplate.status, body: badTemplateText };
  assert.equal(badTemplate.status, 500);
  assert.match(badTemplateText, /doesNotExist/);
  summary.checks.angularTemplateDiagnostic = true;
  changed = awaitChange(templatePath);
  await put('src/counter.html', validTemplate);
  await changed;
  await page.waitForFunction(
    (before) =>
      performance.timeOrigin > before && document.body.getAttribute('data-bootstrapped') === 'true',
    beforeTemplateRecovery,
    { timeout: 60000 },
  );
  await page.waitForSelector('ng-doc-demo [data-testid=counter]');
  summary.checks.templateErrorRecovery = true;
  mark('ssr:probe-start');
  try {
    const ssr = await server.ssrLoadModule('/src/server.ts');
    let deadline;
    let html;
    try {
      html = await Promise.race([
        ssr.render(origin + '/first'),
        new Promise((_, reject) => {
          deadline = setTimeout(
            () => reject(new Error('SSR did not stabilize within 30 seconds')),
            30000,
          );
        }),
      ]);
    } finally {
      clearTimeout(deadline);
    }
    await writeFile(join(evidence, 'ssr.html'), html);
    assert.match(html, /First generated guide/);
    assert.match(html, /Provided by entry/);
    summary.ssr = {
      status: 'rendered',
      guide: true,
      demo: true,
      playground: html.includes('Playground start'),
    };
  } catch (error) {
    summary.ssr = { status: 'unsupported-in-spike', error: error.stack || String(error) };
  }
  mark('ssr:probe-complete', { status: summary.ssr.status });
  assert.equal(server.httpServer, httpServer);
  summary.checks.initialGenerationOrdering =
    events.findIndex((event) => event.event === 'generation:ready') <
    events.findIndex((event) => event.event === 'angular-build-start-observed');
  summary.passed = Object.values(summary.checks).every((value) => value === true);
  assert.equal(summary.passed, true);
} catch (error) {
  summary.failure = error.stack || String(error);
  process.exitCode = 1;
  console.error(summary.failure);
} finally {
  if (browser) await browser.close();
  if (server) await server.close();
  summary.disposed = { browser: !browser?.isConnected(), server: !server?.httpServer?.listening };
  if (process.env.KEEP_SPIKE_FIXTURE !== '1') await rm(fixture, { recursive: true, force: true });
  mark('disposed', summary.disposed);
  await writeFile(
    join(evidence, 'results.json'),
    JSON.stringify({ ...summary, events, messages, errors, requests }, null, 2),
  );
}
