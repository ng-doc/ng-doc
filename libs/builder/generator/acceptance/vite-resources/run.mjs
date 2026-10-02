// Real Vite resource acceptance. Run only against an explicitly frozen built digest.
import assert from 'node:assert/strict';
import { execFile, fork } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const filename = fileURLToPath(import.meta.url);
const repository = fileURLToPath(new URL('../../../../../', import.meta.url));
const evidence = path.resolve(
  process.env.NGDOC_VITE_RESOURCES_EVIDENCE ??
    path.join(repository, 'tmp/acceptance/vite-resources'),
);
const digest = (value) => createHash('sha256').update(value).digest('hex');
const require = createRequire(import.meta.url);
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fsUrl = (file) => `/@fs/${file.split(path.sep).map(encodeURIComponent).join('/')}`;
const message = (error) => (error instanceof Error ? error.stack : String(error));

async function supervise() {
  if (process.env.NGDOC_VITE_RESOURCES_FACTORY) {
    assert.ok(
      path.isAbsolute(process.env.NGDOC_VITE_RESOURCES_FACTORY),
      'Factory path must be absolute',
    );
    assert.match(
      process.env.NGDOC_VITE_RESOURCES_FACTORY_SHA256 ?? '',
      /^[a-f0-9]{64}$/,
      'Factory digest required',
    );
    for (const option of ['COPY_PATCH', 'PRESERVE_EXTERNAL', 'ANGULAR_PACKAGE']) {
      assert.ok(
        !process.env[`NGDOC_VITE_RESOURCES_${option}`],
        `External factory cannot combine with ${option}`,
      );
    }
  }
  assert.match(
    process.env.NGDOC_EXPECTED_SOURCE_DIGEST ?? '',
    /^[a-f0-9]{64}$/,
    'Explicit built source digest required',
  );
  await mkdir(evidence, { recursive: true });
  const child = fork(filename, [], {
    detached: true,
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    env: { ...process.env, NGDOC_RESOURCE_CHILD: '1' },
  });
  const groups = new Set([child.pid]);
  child.on('message', (event) => {
    if (event?.kind === 'owned-browser' && Number.isInteger(event.pid)) groups.add(event.pid);
  });
  const exit = new Promise((resolve) =>
    child.once('close', (code, signal) => resolve({ code, signal })),
  );
  let timedOut = false;
  const killOwned = (signal) => {
    for (const pid of groups) {
      try {
        process.kill(-pid, signal);
      } catch (error) {
        if (error.code !== 'ESRCH') throw error;
      }
    }
  };
  const timer = setTimeout(() => {
    timedOut = true;
    killOwned('SIGTERM');
  }, 360_000);
  const hard = setTimeout(() => {
    timedOut = true;
    killOwned('SIGKILL');
  }, 375_000);
  const result = await exit;
  clearTimeout(timer);
  clearTimeout(hard);
  if (timedOut) killOwned('SIGKILL');
  let stillOwned = [];
  for (const pid of groups) {
    try {
      process.kill(-pid, 0);
      stillOwned.push(pid);
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  }
  const requiredForcedCleanup = stillOwned.length > 0;
  if (requiredForcedCleanup) {
    killOwned('SIGKILL');
    const end = Date.now() + 10_000;
    while (stillOwned.length && Date.now() < end) {
      await pause(50);
      stillOwned = stillOwned.filter((pid) => {
        try {
          process.kill(-pid, 0);
          return true;
        } catch (error) {
          if (error.code !== 'ESRCH') throw error;
          return false;
        }
      });
    }
  }
  // A child close is always joined. Forced cleanup is a failure, never a successful watchdog exit.
  const summary = {
    ...result,
    timedOut,
    requiredForcedCleanup,
    stillOwned,
    joinedChild: true,
    passed: result.code === 0 && !timedOut && !requiredForcedCleanup && stillOwned.length === 0,
  };
  await writeFile(path.join(evidence, 'supervisor.json'), `${JSON.stringify(summary, null, 2)}\n`);
  if (!summary.passed) process.exitCode = 1;
}

async function run() {
  let angular;
  const [{ createServer, createLogger }, { chromium }] = await Promise.all([
    import('vite'),
    import(
      '/Users/alex/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'
    ),
  ]);
  const { createNgDocVitePlugin } = await import(
    pathToFileURL(path.join(repository, 'dist/libs/builder/generator/vite/index.js')).href
  );
  const summary = {
    diagnostic: {
      useAngularCompilationAPI: process.env.NGDOC_VITE_RESOURCES_COMPILATION_API === '1',
      case1Only: process.env.NGDOC_VITE_RESOURCES_CASE1_ONLY === '1',
      esbuildFalse: process.env.NGDOC_VITE_RESOURCES_ESBUILD_FALSE === '1',
      copiedResourcePatch: process.env.NGDOC_VITE_RESOURCES_COPY_PATCH === '1',
      preserveExternalStyles: process.env.NGDOC_VITE_RESOURCES_PRESERVE_EXTERNAL === '1',
      selectedAngularPackage: process.env.NGDOC_VITE_RESOURCES_ANGULAR_PACKAGE,
      selectedFactory: process.env.NGDOC_VITE_RESOURCES_FACTORY,
    },
    status: 'running',
    runtime: {
      node: process.version,
      vite: require('vite/package.json').version,
      analog: require('@analogjs/vite-plugin-angular/package.json').version,
      angular: require('@angular/core/package.json').version,
    },
    harnessSha256: digest(await readFile(filename)),
    checks: [],
    trace: [],
    browserEvents: [],
    hostLogs: [],
    cleanup: [],
  };
  const fixtures = [];
  const hosts = new Set();
  const browsers = new Set();
  const gates = new Set();
  const pending = new Set();
  let phase = 'startup';
  let shuttingDown = false;
  let recoveryDiagnostic;
  let recoveryOverlapExecuted = false;
  const stamp = (kind, details = {}) => {
    const event = { id: summary.trace.length + 1, phase, kind, at: Date.now(), ...details };
    summary.trace.push(event);
    return event;
  };
  const check = (name, details = {}) => {
    summary.checks.push({ name, ...details });
    console.log(`PASS ${name}`);
  };
  const waitFor = async (name, predicate, timeout = 75_000) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      if (await predicate()) return;
      await pause(25);
    }
    throw new Error(`Timed out: ${name}`);
  };
  const track = (operation) => {
    const observed = Promise.resolve(operation).then(
      (value) => ({ value }),
      (error) => ({ error }),
    );
    pending.add(observed);
    observed.then(() => pending.delete(observed));
    return observed;
  };
  const unwrap = async (operation) => {
    const result = await operation;
    if (result.error) throw result.error;
    return result.value;
  };
  const controls = () => ({
    gate: undefined,
    resource: undefined,
    throwFile: undefined,
    injected: false,
    transformGate: undefined,
    transformFile: undefined,
    olderSuccessGate: undefined,
    olderSuccessFile: undefined,
  });
  const compiled = (result) =>
    typeof result?.code === 'string' && /ɵcmp|ɵɵdefineComponent/.test(result.code);
  function instrument(plugins, control) {
    let count = 0;
    for (const plugin of plugins) {
      if (plugin.name !== '@analogjs/vite-plugin-angular') continue;
      count++;
      for (const name of ['handleHotUpdate', 'transform']) {
        const hook = plugin[name];
        const original = typeof hook === 'function' ? hook : hook?.handler;
        assert.equal(typeof original, 'function', `Missing real Angular ${name}`);
        const wrapped = async function (...args) {
          const file = name === 'transform' ? args[1] : args[0].file;
          const entry = stamp(`angular-${name}-enter`, {
            file,
            modules: name === 'handleHotUpdate' ? args[0].modules.length : undefined,
          });
          try {
            const result = await Reflect.apply(original, this, args);
            if (
              name === 'transform' &&
              file.split('?')[0] === control.transformFile &&
              control.transformGate
            ) {
              const gate = control.transformGate;
              stamp('browser-transform-held', { file });
              gate.entered.resolve();
              await gate.release.promise;
            }
            stamp(`angular-${name}-original-return`, {
              file,
              entry: entry.id,
              emitted: compiled(result),
              digest: result?.code ? digest(result.code) : undefined,
            });
            if (name === 'handleHotUpdate' && file === control.throwFile && !control.injected) {
              control.injected = true;
              stamp('injected-after-original', { file, entry: entry.id });
              throw new Error('T14_RESOURCE_INJECTED_PUBLIC_HOOK');
            }
            if (
              name === 'handleHotUpdate' &&
              file === control.olderSuccessFile &&
              control.olderSuccessGate
            ) {
              const gate = control.olderSuccessGate;
              stamp('older-success-return-held', { file, entry: entry.id });
              gate.entered.resolve();
              await gate.release.promise;
            }
            if (name === 'handleHotUpdate' && file === control.resource && control.gate) {
              const gate = control.gate;
              stamp('resource-return-held', { file });
              gate.entered.resolve();
              await gate.release.promise;
            }
            return result;
          } catch (error) {
            stamp(`angular-${name}-error`, { file, entry: entry.id, error: message(error) });
            throw error;
          }
        };
        plugin[name] = typeof hook === 'function' ? wrapped : { ...hook, handler: wrapped };
      }
    }
    assert.equal(count, 1);
    return plugins;
  }
  const appHtml = (marker = 'app-initial') =>
    `<button data-testid="app-counter" (click)="clicks=clicks+1">App {{clicks}}</button><p data-testid="app-marker">${marker}</p><router-outlet></router-outlet>\n`;
  async function fixture(label, empty = false) {
    await mkdir(path.join(repository, 'tmp'), { recursive: true });
    const root = await mkdtemp(path.join(repository, `tmp/ngdoc-vite-resources-${label}-`));
    fixtures.push(root);
    const put = async (name, text) => {
      const file = path.join(root, name);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, text);
      return file;
    };
    await put('.editorconfig', 'root = true\n');
    const app = await put(
      'src/app.component.ts',
      "import {Component} from '@angular/core'; import {RouterOutlet} from '@angular/router'; @Component({selector:'app-root',standalone:true,imports:[RouterOutlet],templateUrl:'./app.component.html'}) export class AppComponent { clicks=0; }\n",
    );
    const appTemplate = await put('src/app.component.html', appHtml());
    const demo = await put(
      'src/demo.component.ts',
      "import {Component} from '@angular/core'; @Component({selector:'resource-demo',standalone:true,templateUrl:'./demo.component.html',styleUrl:'./demo.component.scss'}) export class DemoComponent { value=0; increment(){this.value=this.value+1;} }\n",
    );
    const demoHtml = await put(
      'src/demo.component.html',
      '<button data-testid="demo-counter" (click)="increment()">Demo {{value}}</button><p data-testid="demo-marker">demo-initial</p>\n',
    );
    const demoScss = await put(
      'src/demo.component.scss',
      '[data-testid="demo-counter"] {background-color:rgb(4,5,6);}\n',
    );
    await put(
      'src/unimported.component.ts',
      "import {Component} from '@angular/core'; @Component({selector:'unimported-resource',standalone:true,templateUrl:'./unimported.component.html'}) export class UnimportedComponent {}\n",
    );
    const unimportedHtml = await put(
      'src/unimported.component.html',
      '<p>unimported-initial</p>\n',
    );
    const nonComponent = await put(
      'src/not-component.ts',
      'export class NotAComponent { value=1; }\n',
    );
    const generated = path.join(root, 'generated');
    const docs = path.join(root, 'docs');
    await mkdir(docs);
    if (!empty) {
      await put(
        'docs/ng-doc.page.ts',
        "import {DemoComponent} from '../src/demo.component'; const page={title:'Resource acceptance',route:'resource',mdFile:'./resource.md',demos:{Resource:DemoComponent}};export default page;\n",
      );
      await put(
        'docs/resource.md',
        '# Resource acceptance\n\n{{ NgDocActions.demo("Resource", {expanded:true}) }}\n',
      );
    }
    const paths = {
      '@ng-doc/generated': [path.join(generated, 'index.ts')],
      '@ng-doc/generated/*': [path.join(generated, '*')],
    };
    for (const library of ['app', 'core', 'ui-kit']) {
      paths[`@ng-doc/${library}`] = [path.join(repository, `dist/libs/${library}`)];
      paths[`@ng-doc/${library}/*`] = [path.join(repository, `dist/libs/${library}/*`)];
    }
    const tsconfig = await put(
      'tsconfig.json',
      JSON.stringify(
        {
          compilerOptions: {
            target: 'ES2022',
            types: ['vite/client'],
            module: 'ESNext',
            moduleResolution: 'bundler',
            strict: true,
            experimentalDecorators: true,
            useDefineForClassFields: false,
            skipLibCheck: true,
            paths,
          },
          angularCompilerOptions: { strictTemplates: true },
          include: ['src/**/*.ts', 'docs/**/*.ts', 'generated/**/*.ts'],
        },
        null,
        2,
      ),
    );
    const config = await put(
      'ng-doc.config.mjs',
      "export default {docsPath:'docs',tsConfig:'tsconfig.json',routePrefix:'',cache:true};\n",
    );
    await put(
      'src/main.ts',
      `import 'zone.js'; import ${JSON.stringify(path.join(repository, 'dist/libs/app/styles/global.css'))};
import {bootstrapApplication} from '@angular/platform-browser'; import {provideHttpClient,withFetch} from '@angular/common/http'; import {provideRouter} from '@angular/router';
import {provideNgDocApp,providePageSkeleton,NG_DOC_DEFAULT_PAGE_SKELETON,provideMainPageProcessor,NG_DOC_DEFAULT_PAGE_PROCESSORS} from '@ng-doc/app';
import {NG_DOC_ROUTING,provideNgDocContext} from '@ng-doc/generated'; import {AppComponent} from './app.component';
bootstrapApplication(AppComponent,{providers:[provideHttpClient(withFetch()),provideNgDocApp(),provideNgDocContext(),providePageSkeleton(NG_DOC_DEFAULT_PAGE_SKELETON),provideMainPageProcessor(NG_DOC_DEFAULT_PAGE_PROCESSORS),provideRouter(NG_DOC_ROUTING)]}).then(()=>document.body.dataset.bootstrapped='yes');\n`,
    );
    await put(
      'index.html',
      '<!doctype html><html><head><base href="/"><link rel="icon" href="data:,"></head><body><app-root></app-root><script type="module" src="/src/main.ts"></script></body></html>',
    );
    await cp(
      path.join(repository, 'dist/libs/ui-kit/assets'),
      path.join(root, 'public/assets/ng-doc/ui-kit'),
      { recursive: true },
    );
    return {
      root,
      docs,
      generated,
      app,
      appHtml: appTemplate,
      demo,
      demoHtml,
      demoScss,
      unimportedHtml,
      nonComponent,
      tsconfig,
      config,
      empty,
    };
  }
  const prebundles = new Set(['@ng-doc/core']);
  for (const library of ['app', 'ui-kit'])
    for (const file of await readdir(path.join(repository, `dist/libs/${library}/fesm2022`))) {
      if (file.endsWith('.mjs'))
        for (const match of (
          await readFile(path.join(repository, `dist/libs/${library}/fesm2022`, file), 'utf8')
        ).matchAll(/['"](@ng-doc\/core(?:\/[^'"]*)?)['"]/g))
          prebundles.add(match[1]);
    }
  async function host(f, control, probe = f.app) {
    const observation = {
      name: 'resource-public-observation',
      enforce: 'pre',
      configureServer(server) {
        const client = server.environments.client;
        const original = client.transformRequest;
        client.transformRequest = async function (...args) {
          const entry = stamp('public-transform-request', { url: args[0], probe: fsUrl(probe) });
          try {
            const result = await Reflect.apply(original, this, args);
            stamp('public-transform-return', {
              entry: entry.id,
              url: args[0],
              digest: result?.code ? digest(result.code) : undefined,
            });
            return result;
          } catch (error) {
            stamp('public-transform-error', {
              entry: entry.id,
              url: args[0],
              error: message(error),
            });
            throw error;
          }
        };
      },
      hotUpdate: {
        order: 'pre',
        handler(context) {
          stamp('native-pre', { file: context.file, type: context.type });
        },
      },
    };
    const plugins = createNgDocVitePlugin({
      analogLiveReload: true,
      angularPlugins: instrument(
        angular({
          tsconfig: f.tsconfig,
          workspaceRoot: f.root,
          disableTypeChecking: false,
          jit: false,
          liveReload: true,
          ...(process.env.NGDOC_VITE_RESOURCES_COMPILATION_API === '1'
            ? { experimental: { useAngularCompilationAPI: true } }
            : {}),
        }),
        control,
      ),
      angularComponentProbe: probe,
      generator: {
        projectId: `resources-${path.basename(f.root)}`,
        workspaceRoot: f.root,
        configFile: f.config,
        defaults: {
          docsRoot: f.docs,
          tsConfig: f.tsconfig,
          outputRoot: f.generated,
          cacheRoot: path.join(f.root, 'cache'),
        },
        session: { batchDelayMs: 5 },
      },
    });
    const logger = createLogger('warn');
    const originalError = logger.error.bind(logger);
    logger.error = (text, options) => {
      summary.hostLogs.push({
        phase,
        level: 'error',
        message: String(text),
        errorCode: text && typeof text === 'object' ? text.code : undefined,
      });
      originalError(text, options);
    };
    const server = await createServer({
      cacheDir: path.join(f.root, 'cache/vite'),
      ...(process.env.NGDOC_VITE_RESOURCES_ESBUILD_FALSE === '1' ? { esbuild: false } : {}),
      customLogger: logger,
      root: f.root,
      configFile: false,
      logLevel: 'warn',
      plugins: [observation, plugins],
      optimizeDeps: { include: [...prebundles] },
      resolve: {
        alias: ['app', 'core', 'ui-kit'].map((lib) => ({
          find: `@ng-doc/${lib}`,
          replacement: path.join(repository, `dist/libs/${lib}`),
        })),
        dedupe: [
          '@angular/core',
          '@angular/common',
          '@angular/compiler',
          '@angular/router',
          '@angular/platform-browser',
        ],
      },
      server: { host: '127.0.0.1', port: 0, fs: { allow: [repository, f.root] } },
    });
    hosts.add(server);
    await server.listen();
    const address = server.httpServer.address();
    assert.ok(address && typeof address !== 'string');
    return { server, origin: `http://127.0.0.1:${address.port}` };
  }
  async function closeHost(server) {
    await server.close();
    assert.equal(server.httpServer?.listening, false);
    hosts.delete(server);
    summary.cleanup.push({ kind: 'host', closed: true });
  }
  async function browserPage(origin, route) {
    const owner = await chromium.launchServer({
      executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      headless: true,
    });
    browsers.add(owner);
    const pid = owner.process().pid;
    const { stdout } = await promisify(execFile)('/bin/ps', ['-o', 'pgid=', '-p', String(pid)]);
    assert.equal(Number(stdout.trim()), pid, 'Owned browser must lead its own process group');
    stamp('owned-browser-group', { pid, pgid: Number(stdout.trim()) });
    process.send?.({ kind: 'owned-browser', pid });
    const browser = await chromium.connect(owner.wsEndpoint());
    const page = await browser.newPage();
    page.setDefaultTimeout(75_000);
    page.on('pageerror', (error) =>
      summary.browserEvents.push({ phase, kind: 'pageerror', message: error.message }),
    );
    page.on('console', (event) => {
      if (event.type() === 'error')
        summary.browserEvents.push({
          phase,
          kind: 'console',
          message: event.text(),
          location: event.location(),
        });
    });
    page.on('response', (response) => {
      if (response.status() >= 400)
        summary.browserEvents.push({
          phase,
          kind: 'http',
          status: response.status(),
          url: response.url(),
        });
    });
    page.on('load', () => stamp('browser-load', { url: page.url() }));
    const response = await page.goto(origin + route);
    assert.equal(response.status(), 200);
    await page.locator('body[data-bootstrapped="yes"]').waitFor();
    return { owner, browser, page };
  }
  async function closeBrowser(owner) {
    await owner.close();
    browsers.delete(owner);
    summary.cleanup.push({ kind: 'browser', closed: true });
  }
  async function ownWitness(after, probe) {
    await waitFor('adapter-owned public probe', () =>
      summary.trace.some(
        (e) =>
          e.id > after &&
          e.kind === 'public-transform-return' &&
          decodeURIComponent(e.url).replace(/^\/@fs\/+/, '/') === probe,
      ),
    );
    const returned = summary.trace.find(
      (e) =>
        e.id > after &&
        e.kind === 'public-transform-return' &&
        decodeURIComponent(e.url).replace(/^\/@fs\/+/, '/') === probe,
    );
    const request = summary.trace.find((e) => e.id === returned.entry);
    assert.ok(request.id > after);
    assert.ok(
      summary.trace.some(
        (e) =>
          e.id > request.id &&
          e.id < returned.id &&
          e.kind === 'angular-transform-original-return' &&
          e.entry > request.id &&
          e.file.split('?')[0] === probe &&
          e.emitted,
      ),
      'Adapter probe did not traverse original Angular component emission',
    );
    return { request: request.id, returned: returned.id };
  }
  async function shownCode(page, file, marker, compact = false) {
    const demo = page.locator('ng-doc-demo');
    await demo.locator('.ng-doc-demo-view[role=tab]').filter({ hasText: file }).click();
    const code = demo.locator('ng-doc-code');
    if (compact) {
      await code.waitFor();
      let actual;
      try {
        await waitFor(
          'exact displayed ' + file + ' assignment',
          async () => {
            actual = await code.innerText();
            return actual.replace(/\s/g, '').includes(marker);
          },
          15_000,
        );
      } finally {
        stamp('displayed-source', { file, expected: marker, actual });
      }
      assert.ok(actual.replace(/\s/g, '').includes(marker));
    } else {
      await code.filter({ hasText: marker }).waitFor();
      assert.ok((await code.innerText()).includes(marker));
    }
  }
  async function manifest(f) {
    return JSON.parse(
      await readFile(path.join(f.generated, '.ng-doc-output-manifest.json'), 'utf8'),
    );
  }
  const stop = () => {
    shuttingDown = true;
    for (const gate of gates) gate.release.resolve();
  };
  process.once('SIGTERM', stop);
  try {
    summary.provenance = JSON.parse(
      await readFile(
        path.join(repository, 'dist/libs/builder/generator/build-provenance.json'),
        'utf8',
      ),
    );
    assert.equal(summary.provenance.sourceDigest, process.env.NGDOC_EXPECTED_SOURCE_DIGEST);
    if (process.env.NGDOC_VITE_RESOURCES_FACTORY) {
      const selectedFactory = process.env.NGDOC_VITE_RESOURCES_FACTORY;
      const sha256 = digest(await readFile(selectedFactory));
      assert.equal(
        sha256,
        process.env.NGDOC_VITE_RESOURCES_FACTORY_SHA256,
        'Selected factory changed',
      );
      summary.angularFactory = { path: selectedFactory, sha256 };
      angular = (await import(pathToFileURL(selectedFactory).href)).default;
      assert.equal(
        typeof angular,
        'function',
        'Selected module must export the complete Angular factory',
      );
    } else if (process.env.NGDOC_VITE_RESOURCES_COPY_PATCH === '1') {
      const packageRoot = process.env.NGDOC_VITE_RESOURCES_ANGULAR_PACKAGE
        ? path.resolve(process.env.NGDOC_VITE_RESOURCES_ANGULAR_PACKAGE)
        : path.dirname(require.resolve('@analogjs/vite-plugin-angular/package.json'));
      const selectedPackage = JSON.parse(
        await readFile(path.join(packageRoot, 'package.json'), 'utf8'),
      );
      summary.runtime.installedAnalog = summary.runtime.analog;
      summary.runtime.analog = selectedPackage.version;
      await mkdir(path.join(repository, 'tmp'), { recursive: true });
      const copied = await mkdtemp(path.join(repository, 'tmp/ngdoc-rc1-angular-copy-'));
      fixtures.push(copied);
      await cp(packageRoot, copied, { recursive: true });
      const relativeFile = 'src/lib/angular-vite-plugin.js';
      const original = await readFile(path.join(copied, relativeFile), 'utf8');
      const before =
        'pendingCompilation = performCompilation(resolvedConfig, [\n                        ...mods.map((mod) => mod.id),';
      const after =
        'pendingCompilation = performCompilation(resolvedConfig, [\n                        ctx.file,\n                        ...mods.map((mod) => mod.id),';
      assert.equal(original.split(before).length, 2, 'Exact one upstream resource call required');
      let patched = original.replace(before, after);
      const patches = [{ before, after }];
      if (process.env.NGDOC_VITE_RESOURCES_PRESERVE_EXTERNAL === '1') {
        const externalBefore =
          "externalComponentStyles = tsCompilerOptions['externalRuntimeStyles']\n                ? new Map()\n                : undefined;";
        const externalAfter =
          "externalComponentStyles = tsCompilerOptions['externalRuntimeStyles']\n                ? new Map(externalComponentStyles)\n                : undefined;";
        assert.equal(patched.split(externalBefore).length, 2, 'Exact external-map reset required');
        patched = patched.replace(externalBefore, externalAfter);
        patches.push({ before: externalBefore, after: externalAfter });
      }
      await writeFile(path.join(copied, relativeFile), patched);
      const inventory = async (root) => {
        const values = [];
        const visit = async (directory) => {
          for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) =>
            a.name.localeCompare(b.name),
          )) {
            const file = path.join(directory, entry.name);
            if (entry.isDirectory()) await visit(file);
            else if (entry.isFile())
              values.push([path.relative(root, file), digest(await readFile(file))]);
            else throw new Error('Unexpected package symlink ' + file);
          }
        };
        await visit(root);
        return values;
      };
      const baselineFiles = await inventory(packageRoot);
      const copiedFiles = await inventory(copied);
      summary.angularCopy = {
        packageVersion: summary.runtime.analog,
        originalPackageDigest: digest(JSON.stringify(baselineFiles)),
        copiedPackageDigest: digest(JSON.stringify(copiedFiles)),
        changedFiles: copiedFiles.filter(
          ([file, hash]) => baselineFiles.find(([name]) => name === file)?.[1] !== hash,
        ),
        before,
        after,
        patches,
        baselineFiles,
        copiedFiles,
      };
      assert.deepEqual(
        summary.angularCopy.changedFiles.map(([file]) => file),
        [relativeFile],
      );
      await writeFile(
        path.join(evidence, 'angular-patch.json'),
        JSON.stringify(summary.angularCopy, null, 2) + '\n',
      );
      angular = (
        await import(pathToFileURL(path.join(copied, selectedPackage.exports['.'].import)).href)
      ).default;
    } else {
      angular = (
        await import(
          pathToFileURL(path.join(repository, 'dist/libs/builder/generator/vite/angular/index.js'))
            .href
        )
      ).createNgDocAngularPlugins;
    }
    const f = await fixture('demo');
    const control = controls();
    const h = await host(f, control);
    phase = 'unimported';
    const start = summary.trace.length;
    await writeFile(f.unimportedHtml, '<p>unimported-updated</p>\n');
    await waitFor('unimported resource hook', () =>
      summary.trace.some(
        (e) =>
          e.id > start &&
          e.kind === 'angular-handleHotUpdate-original-return' &&
          e.file === f.unimportedHtml,
      ),
    );
    const entry = summary.trace.find(
      (e) =>
        e.id > start && e.kind === 'angular-handleHotUpdate-enter' && e.file === f.unimportedHtml,
    );
    assert.equal(entry.modules, 0);
    const unimportedWitness = await ownWitness(entry.id, f.app);
    const unimportedResponse = await fetch(h.origin + '/src/unimported.component.ts');
    assert.equal(unimportedResponse.status, 200);
    assert.match(await unimportedResponse.text(), /unimported-updated/);
    check('unimported-empty-module-adapter-witness', {
      branchEntry: entry.id,
      witness: unimportedWitness,
      emittedTemplateMarker: true,
    });
    if (process.env.NGDOC_VITE_RESOURCES_CASE1_ONLY === '1') {
      summary.status = 'passed';
      return;
    }
    phase = 'demo';
    const b = await browserPage(h.origin, '/resource');
    const { page } = b;
    await page
      .locator('ng-doc-page ng-doc-demo [data-testid="demo-marker"]')
      .filter({ hasText: 'demo-initial' })
      .waitFor();
    const button = page.locator('ng-doc-demo [data-testid="demo-counter"]');
    await button.click();
    await waitFor(
      'initial embedded demo interaction',
      async () => (await button.innerText()) === 'Demo 1',
      15_000,
    );
    assert.equal(await button.innerText(), 'Demo 1');
    const before = await manifest(f);
    const htmlReload = track(page.waitForEvent('load', { timeout: 75_000 }));
    await writeFile(
      f.demoHtml,
      '<button data-testid="demo-counter" (click)="increment()">Demo {{value}}</button><p data-testid="demo-marker">demo-html-updated</p>\n',
    );
    await unwrap(htmlReload);
    await page.locator('body[data-bootstrapped="yes"]').waitFor();
    await page
      .locator('ng-doc-demo [data-testid="demo-marker"]')
      .filter({ hasText: 'demo-html-updated' })
      .waitFor();
    await shownCode(page, 'HTML', 'demo-html-updated');
    const scssReload = track(page.waitForEvent('load', { timeout: 75_000 }));
    await writeFile(f.demoScss, '[data-testid="demo-counter"] {background-color:rgb(7,8,9);}\n');
    await unwrap(scssReload);
    await page.locator('body[data-bootstrapped="yes"]').waitFor();
    await waitFor('embedded demo SCSS', () =>
      button.evaluate((node) => getComputedStyle(node).backgroundColor === 'rgb(7, 8, 9)'),
    );
    await shownCode(page, 'SCSS', 'background-color');
    assert.match(
      (await page.locator('ng-doc-demo ng-doc-code').innerText()).replace(/\s/g, ''),
      /rgb\(7,8,9\)/,
    );
    const after = await manifest(f);
    assert.notDeepEqual(
      after.files,
      before.files,
      'Resource edits did not update generator products',
    );
    const beforeStyleClick = Number((await button.innerText()).match(/\d+/)[0]);
    await button.click();
    await waitFor(
      'styled demo interaction',
      async () => (await button.innerText()) === `Demo ${beforeStyleClick + 1}`,
      15_000,
    );
    assert.equal(await button.innerText(), `Demo ${beforeStyleClick + 1}`);
    check('ngdoc-embedded-html-scss-runtime-and-shown-code', {
      before: digest(JSON.stringify(before.files)),
      after: digest(JSON.stringify(after.files)),
    });
    phase = 'overlap';
    const gate = { entered: deferred(), release: deferred() };
    gates.add(gate);
    control.gate = gate;
    control.resource = f.unimportedHtml;
    const overlapStart = summary.trace.length;
    await writeFile(f.unimportedHtml, '<p>overlap-resource</p>\n');
    await gate.entered.promise;
    // The held boundary follows the real handler return, not the inner compiler promise.
    const transformGate = { entered: deferred(), release: deferred() };
    gates.add(transformGate);
    control.transformFile = f.demo;
    control.transformGate = transformGate;
    const demoNode =
      await h.server.environments.client.moduleGraph.ensureEntryFromUrl('/src/demo.component.ts');
    h.server.environments.client.moduleGraph.invalidateModule(demoNode);
    const browserRequest = track(page.request.get(h.origin + '/src/demo.component.ts'));
    await transformGate.entered.promise;
    const demoSource = await readFile(f.demo, 'utf8');
    const tsReload = track(page.waitForEvent('load', { timeout: 75_000 }));
    await writeFile(f.demo, demoSource.replace('this.value+1', 'this.value+2'));
    await waitFor('later native TS admission', () =>
      summary.trace.some(
        (e) => e.id > overlapStart && e.kind === 'native-pre' && e.file === f.demo,
      ),
    );
    assert.equal(
      summary.trace.some(
        (e) =>
          e.id > overlapStart && e.kind === 'angular-handleHotUpdate-enter' && e.file === f.demo,
      ),
      false,
      'Later compiler hook bypassed resource ownership',
    );
    gate.release.resolve();
    control.gate = undefined;
    gates.delete(gate);
    const witness = await ownWitness(overlapStart, f.app);
    transformGate.release.resolve();
    control.transformGate = undefined;
    gates.delete(transformGate);
    assert.equal((await unwrap(browserRequest)).status(), 200);
    await waitFor('later Angular TS admission', () =>
      summary.trace.some(
        (e) =>
          e.id > witness.returned &&
          e.kind === 'angular-handleHotUpdate-enter' &&
          e.file === f.demo,
      ),
    );
    await unwrap(tsReload);
    await page.locator('body[data-bootstrapped="yes"]').waitFor();
    await shownCode(page, 'TypeScript', 'this.value=this.value+2;', true);
    const old = Number((await button.innerText()).match(/\d+/)[0]);
    await button.click();
    await waitFor(
      'updated embedded demo interaction',
      async () => (await button.innerText()) === `Demo ${old + 2}`,
      15_000,
    );
    assert.equal(await button.innerText(), `Demo ${old + 2}`);
    check('resource-browser-request-and-later-ts', {
      witness,
      limit: 'public hook boundary only; no private pending-compilation duration assertion',
    });
    phase = 'recovery-overlap';
    recoveryOverlapExecuted = true;
    const invalidOwner = path.join(f.root, 'src/recovery-invalid-owner.component.ts');
    const diagnosticStart = summary.trace.length;
    const hostLogStart = summary.hostLogs.length;
    const loadsBeforeDiagnostic = summary.trace.filter(
      (event) => event.kind === 'browser-load',
    ).length;
    const olderSuccessGate = { entered: deferred(), release: deferred() };
    gates.add(olderSuccessGate);
    control.olderSuccessGate = olderSuccessGate;
    control.olderSuccessFile = f.demo;
    const olderDemoSource = await readFile(f.demo, 'utf8');
    await writeFile(f.demo, olderDemoSource.replace('this.value+2', 'this.value+3'));
    await olderSuccessGate.entered.promise;
    assert.ok(
      summary.trace.some(
        (event) =>
          event.id > diagnosticStart &&
          event.kind === 'angular-handleHotUpdate-original-return' &&
          event.file === f.demo,
      ),
      'Older demo TypeScript hook did not finish real Angular work before its hold',
    );
    await writeFile(
      invalidOwner,
      "import {Component} from '@angular/core'; @Component({selector:'recovery-invalid-owner',standalone:true,template:'{{ missingRecoveryOwner }}',styles:['.recovery-invalid { color: rgb(90,91,92); }']}) export class RecoveryInvalidOwnerComponent {}\n",
    );
    await waitFor('native invalid owner add', () =>
      summary.trace.some(
        (event) =>
          event.id > diagnosticStart && event.kind === 'native-pre' && event.file === invalidOwner,
      ),
    );
    await waitFor('background end-pass diagnostic', () =>
      summary.hostLogs
        .slice(hostLogStart)
        .some((event) => event.errorCode === 'NGDOC_ANALOG_COMPILATION_DIAGNOSTIC'),
    );
    const diagnosticLog = summary.hostLogs
      .slice(hostLogStart)
      .find((event) => event.errorCode === 'NGDOC_ANALOG_COMPILATION_DIAGNOSTIC');
    assert.ok(diagnosticLog, 'Expected real logger diagnostic was not captured');
    const canonicalMessage = diagnosticLog.message.replace(/^Error:\s*/, '');
    assert.match(canonicalMessage, /^\[ANALOG_STYLE_REGISTRY_INVALID\] /);
    assert.ok(
      canonicalMessage.includes(invalidOwner),
      'Diagnostic omitted the exact invalid owner path',
    );
    assert.ok(
      canonicalMessage.includes('missingRecoveryOwner'),
      'Diagnostic omitted missingRecoveryOwner',
    );
    recoveryDiagnostic = {
      errorCode: diagnosticLog.errorCode,
      canonicalMessage,
      invalidOwner,
    };
    const rejectedTransform = await fetch(
      h.origin + '/src/demo.component.ts?recovery-diagnostic=1',
    );
    assert.equal(
      rejectedTransform.status,
      500,
      'Public transform must expose the background diagnostic',
    );
    assert.match(
      await rejectedTransform.text(),
      /ANALOG_STYLE_REGISTRY_INVALID.*missingRecoveryOwner/s,
    );
    await waitFor('last-good demo CSS remains active after diagnostic', () =>
      button.evaluate((node) => getComputedStyle(node).backgroundColor === 'rgb(7, 8, 9)'),
    );
    assert.equal(
      summary.trace.filter((event) => event.kind === 'browser-load').length,
      loadsBeforeDiagnostic,
      'Background diagnostic triggered a stale browser reload before repair',
    );
    olderSuccessGate.release.resolve();
    gates.delete(olderSuccessGate);
    control.olderSuccessGate = undefined;
    control.olderSuccessFile = undefined;
    const stillRejected = await fetch(
      h.origin + '/src/demo.component.ts?recovery-after-older-success=1',
    );
    assert.equal(
      stillRejected.status,
      500,
      'Released older successful hook cleared the later current diagnostic',
    );
    assert.match(
      await stillRejected.text(),
      /ANALOG_STYLE_REGISTRY_INVALID.*missingRecoveryOwner/s,
    );
    assert.equal(
      summary.trace.filter((event) => event.kind === 'browser-load').length,
      loadsBeforeDiagnostic,
      'Released older success triggered a stale browser reload while failure remained current',
    );
    const recoveryGate = { entered: deferred(), release: deferred() };
    gates.add(recoveryGate);
    control.gate = recoveryGate;
    control.resource = f.demoHtml;
    const recoveryStart = summary.trace.length;
    const reload = track(page.waitForEvent('load', { timeout: 75_000 }));
    await writeFile(
      invalidOwner,
      "import {Component} from '@angular/core'; @Component({selector:'recovery-invalid-owner',standalone:true,template:'recovery owner repaired',styles:['.recovery-invalid { color: rgb(93,94,95); }']}) export class RecoveryInvalidOwnerComponent {}\n",
    );
    await writeFile(
      f.demoHtml,
      '<button data-testid="demo-counter" (click)="increment()">Demo {{value}}</button><p data-testid="demo-marker">recovery-overlap-content</p>\n',
    );
    await writeFile(f.demoScss, '[data-testid="demo-counter"] {background-color:rgb(11,12,13);}\n');
    const recoveryDemoSource = await readFile(f.demo, 'utf8');
    await writeFile(f.demo, recoveryDemoSource.replace('this.value+3', 'this.value+4'));
    await recoveryGate.entered.promise;
    assert.equal(
      summary.trace.filter((event) => event.kind === 'browser-load').length,
      loadsBeforeDiagnostic,
      'Browser reloaded before the overlapping repaired resource hook was released',
    );
    await pause(1_000);
    assert.equal(
      summary.trace.filter((event) => event.kind === 'browser-load').length,
      loadsBeforeDiagnostic,
      'Browser reloaded while the overlapping repaired resource hook was held',
    );
    recoveryGate.release.resolve();
    gates.delete(recoveryGate);
    control.gate = undefined;
    control.resource = undefined;
    await unwrap(reload);
    await page.locator('body[data-bootstrapped="yes"]').waitFor();
    await page
      .locator('ng-doc-demo [data-testid="demo-marker"]')
      .filter({ hasText: 'recovery-overlap-content' })
      .waitFor();
    await shownCode(page, 'HTML', 'recovery-overlap-content');
    await shownCode(page, 'SCSS', 'rgb(11,12,13)', true);
    await shownCode(page, 'TypeScript', 'this.value=this.value+4;', true);
    await waitFor('recovered newest demo CSS', () =>
      button.evaluate((node) => getComputedStyle(node).backgroundColor === 'rgb(11, 12, 13)'),
    );
    await button.click();
    await waitFor(
      'recovered newest demo interaction',
      async () => (await button.innerText()) === 'Demo 4',
      15_000,
    );
    for (const file of [invalidOwner, f.demoHtml, f.demoScss, f.demo]) {
      assert.ok(
        summary.trace.some(
          (event) => event.id > recoveryStart && event.kind === 'native-pre' && event.file === file,
        ),
        `Repair overlap did not observe native filesystem event for ${file}`,
      );
    }
    check('background-diagnostic-repair-overlap-publishes-newest-browser-content-and-style', {
      diagnosticBoundary: 'public-transform-500',
      olderSuccessHeldAfterOriginalReturn: true,
      olderSuccessReleasedWhileDiagnosticCurrent: true,
      heldResource: f.demoHtml,
      heldForMs: 1_000,
      noEarlyReload: true,
    });
    await closeBrowser(b.owner);
    await closeHost(h.server);
    phase = 'empty';
    const empty = await fixture('empty', true);
    const eh = await host(empty, controls());
    const eb = await browserPage(eh.origin, '/');
    assert.equal(
      (await manifest(empty)).files.some((file) => file.path.endsWith('/page.ts')),
      false,
    );
    const emptyStart = summary.trace.length;
    await writeFile(empty.appHtml, appHtml('empty-updated'));
    await eb.page.getByTestId('app-marker').filter({ hasText: 'empty-updated' }).waitFor();
    check('empty-docs-real-app-probe', { witness: await ownWitness(emptyStart, empty.app) });
    await closeBrowser(eb.owner);
    await closeHost(eh.server);
    phase = 'invalid-probes';
    for (const kind of ['missing', 'noncomponent']) {
      const invalid = await fixture(kind, true);
      let unexpected;
      let error;
      try {
        unexpected = await host(
          invalid,
          controls(),
          kind === 'missing' ? path.join(invalid.root, 'src/missing.ts') : invalid.nonComponent,
        );
      } catch (value) {
        error = value;
      }
      if (unexpected) {
        try {
          const response = await fetch(unexpected.origin + '/', {
            headers: { accept: 'text/html' },
            signal: AbortSignal.timeout(15_000),
          });
          assert.equal(response.status, 500, `${kind} probe must fail first public HTML admission`);
          const body = await response.text();
          assert.match(body, /probe|component/i);
          check(`reject-${kind}-probe`, {
            boundary: 'first-html',
            status: response.status,
            diagnostic: body,
          });
        } finally {
          await closeHost(unexpected.server);
        }
      } else {
        assert.ok(error, `${kind} probe was accepted`);
        assert.match(message(error), /probe|component/i);
        check(`reject-${kind}-probe`, { boundary: 'startup', error: message(error) });
      }
    }
    phase = 'poison';
    const poison = await fixture('poison');
    const pc = controls();
    const ph = await host(poison, pc);
    const pb = await browserPage(ph.origin, '/resource');
    const stable = digest(JSON.stringify((await manifest(poison)).files));
    pc.throwFile = poison.appHtml;
    const poisonStart = summary.trace.length;
    await writeFile(poison.appHtml, appHtml('poisoned-edit'));
    await waitFor('injected original public-hook failure', () => pc.injected);
    await waitFor('injection trace', () =>
      summary.trace.some(
        (e) =>
          e.id > poisonStart &&
          e.kind === 'angular-handleHotUpdate-error' &&
          e.error.includes('T14_RESOURCE_INJECTED_PUBLIC_HOOK'),
      ),
    );
    const injection = summary.trace.find(
      (e) => e.id > poisonStart && e.kind === 'injected-after-original',
    );
    assert.ok(injection);
    assert.ok(
      summary.trace.some(
        (e) =>
          e.id < injection.id &&
          e.kind === 'angular-handleHotUpdate-original-return' &&
          e.entry === injection.entry,
      ),
    );
    assert.equal(
      digest(JSON.stringify((await manifest(poison)).files)),
      stable,
      'Application-only failure changed generator bytes',
    );
    const poisonedResponse = await fetch(ph.origin + '/resource', {
      headers: { accept: 'text/html' },
    });
    assert.equal(poisonedResponse.status, 500);
    assert.match(await poisonedResponse.text(), /T14_RESOURCE_INJECTED_PUBLIC_HOOK/);
    await closeBrowser(pb.owner);
    await closeHost(ph.server);
    phase = 'recovered';
    const recovered = await host(poison, controls());
    const rb = await browserPage(recovered.origin, '/resource');
    await rb.page.getByTestId('app-marker').filter({ hasText: 'poisoned-edit' }).waitFor();
    await rb.page.getByTestId('app-counter').click();
    await waitFor(
      'fresh host interaction',
      async () => (await rb.page.getByTestId('app-counter').innerText()) === 'App 1',
      15_000,
    );
    assert.equal(await rb.page.getByTestId('app-counter').innerText(), 'App 1');
    check('poisoned-host-fresh-factory-recovery', {
      injectionBoundary: 'after-actual-original-hook-return',
      injection: injection.id,
    });
    phase = 'dispose-held';
    const dc = controls();
    await closeBrowser(rb.owner);
    await closeHost(recovered.server);
    const dh = await host(poison, dc);
    const finalGate = { entered: deferred(), release: deferred() };
    gates.add(finalGate);
    dc.resource = poison.unimportedHtml;
    dc.gate = finalGate;
    await writeFile(poison.unimportedHtml, '<p>dispose-held</p>\n');
    await finalGate.entered.promise;
    const closing = track(closeHost(dh.server));
    finalGate.release.resolve();
    gates.delete(finalGate);
    await unwrap(closing);
    check('joined-disposal-with-held-public-hook');
    const expectedPoisonUrl = (url) => {
      try {
        const parsed = new URL(url);
        return (
          parsed.origin === ph.origin &&
          ['/resource', '/src/app.component.html'].includes(parsed.pathname)
        );
      } catch {
        return false;
      }
    };
    const unexpected = summary.browserEvents.filter(
      (event) =>
        !(
          event.phase === 'poison' &&
          ((event.kind === 'console' &&
            (event.message.includes('T14_RESOURCE_INJECTED_PUBLIC_HOOK') ||
              (event.message.includes('Failed to load resource') &&
                expectedPoisonUrl(event.location?.url)))) ||
            (event.kind === 'http' && event.status === 500 && expectedPoisonUrl(event.url)))
        ),
    );
    let recoveryDiagnosticMatches = [];
    if (recoveryOverlapExecuted) {
      assert.ok(recoveryDiagnostic, 'Recovery diagnostic oracle was not initialized');
      recoveryDiagnosticMatches = summary.hostLogs.filter(
        (event) =>
          event.phase === 'recovery-overlap' &&
          event.message.includes(recoveryDiagnostic.canonicalMessage) &&
          (event.errorCode === recoveryDiagnostic.errorCode || event.errorCode === undefined),
      );
      assert.equal(
        recoveryDiagnostic.errorCode,
        'NGDOC_ANALOG_COMPILATION_DIAGNOSTIC',
        'Logger must retain the real diagnostic error code',
      );
      assert.ok(
        recoveryDiagnosticMatches.some((event) => event.errorCode === recoveryDiagnostic.errorCode),
        'Recovery log matches omitted the coded real diagnostic',
      );
      summary.recoveryDiagnosticOracle = {
        expectedErrorCode: recoveryDiagnostic.errorCode,
        canonicalMessage: recoveryDiagnostic.canonicalMessage,
        invalidOwnerPath: recoveryDiagnostic.invalidOwner,
        matchedCodedLogCount: recoveryDiagnosticMatches.filter(
          (event) => event.errorCode === recoveryDiagnostic.errorCode,
        ).length,
        matchedStringLogCount: recoveryDiagnosticMatches.filter(
          (event) => event.errorCode === undefined,
        ).length,
        matchedStringPaths: recoveryDiagnosticMatches
          .filter((event) => event.errorCode === undefined)
          .map((event) => ({
            invalidOwnerPath: event.message.includes(recoveryDiagnostic.invalidOwner)
              ? recoveryDiagnostic.invalidOwner
              : undefined,
            message: event.message,
          })),
      };
    }
    const unexpectedHost = summary.hostLogs.filter(
      (event) =>
        !(
          event.phase === 'poison' && event.message.includes('T14_RESOURCE_INJECTED_PUBLIC_HOOK')
        ) &&
        !(event.phase === 'invalid-probes' && /probe|component/i.test(event.message)) &&
        !recoveryDiagnosticMatches.includes(event),
    );
    assert.deepEqual(unexpectedHost, [], 'Unexpected healthy host error');
    assert.deepEqual(unexpected, [], 'Unexpected healthy/recovery browser errors');
    assert.equal(shuttingDown, false, 'Supervisor interrupted fixture');
    summary.status = 'passed';
  } catch (error) {
    summary.status = 'failed';
    summary.failure = message(error);
    process.exitCode = 1;
  } finally {
    for (const gate of gates) gate.release.resolve();
    await Promise.all([...pending]);
    const cleanup = await Promise.allSettled(
      [...browsers].map(closeBrowser).concat([...hosts].map(closeHost)),
    );
    const failures = cleanup
      .filter((value) => value.status === 'rejected')
      .map((value) => message(value.reason));
    if (failures.length) {
      summary.status = 'failed';
      summary.cleanupErrors = failures;
      process.exitCode = 1;
    }
    for (const root of fixtures) await rm(root, { recursive: true, force: true });
    summary.fixturesRemoved = fixtures.every((root) => !existsSync(root));
    await mkdir(evidence, { recursive: true });
    await writeFile(path.join(evidence, 'results.json'), JSON.stringify(summary, null, 2) + '\n');
    process.removeListener('SIGTERM', stop);
  }
}

if (process.env.NGDOC_VITE_RESOURCES_RUN === '1') {
  if (process.env.NGDOC_RESOURCE_CHILD === '1') await run();
  else await supervise();
}
