import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { createLogger, createServer } from 'vite';

import { analogResourcePolicy } from '../../../../../tools/scripts/analog-resource-patch.mjs';
import { prepareAnalogCopy } from './prepare-copy.mjs';

const repository = path.resolve(import.meta.dirname, '../../../../..');
const evidence = path.resolve(
  process.env.NGDOC_ANALOG_STYLE_EVIDENCE ??
    path.join(repository, 'docs/architecture/evidence/t14/analog-style-ownership/acceptance'),
);
const runtime = path.join(import.meta.dirname, '.runtime');
const require = createRequire(import.meta.url);
const digest = (value) => createHash('sha256').update(value).digest('hex');
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const message = (error) => (error instanceof Error ? error.stack ?? error.message : String(error));
const errorCode = (error) => (error && typeof error === 'object' ? error.code : undefined);
const diagnosticCode = 'NGDOC_ANALOG_COMPILATION_DIAGNOSTIC';
const fatalAnalyzeHook = '__NG_DOC_TEST_FATAL_ANALYZE_HOOK__';

const summary = {
  status: 'running',
  runtime: {
    node: process.version,
    vite: require('vite/package.json').version,
    angular: require('@angular/core/package.json').version,
    analog: require('@analogjs/vite-plugin-angular/package.json').version,
  },
  harnessSha256: digest(await readFile(new URL(import.meta.url))),
  checks: [],
  compilerPasses: [],
  nativeEvents: [],
  errors: [],
  cleanup: {},
};
const fixtures = [];
const servers = new Set();
let requestSequence = 0;

function check(name, details = {}) {
  summary.checks.push({ name, ...details });
  console.log(`PASS ${name}`);
}

async function waitFor(name, predicate, timeout = 30_000) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try {
      last = await predicate();
      if (last) return last;
    } catch (error) {
      last = error;
    }
    await delay(25);
  }
  throw new Error(`Timed out waiting for ${name}${last ? `: ${message(last)}` : ''}`);
}

function hookHandler(hook) {
  return typeof hook === 'function' ? hook : hook.handler;
}

function replaceHook(hook, handler) {
  return typeof hook === 'function' ? handler : { ...hook, handler };
}

function instrumentAngular(plugins, label) {
  let found = 0;
  const events = [];
  const values = plugins.map((plugin) => {
    if (plugin.name !== '@analogjs/vite-plugin-angular') return plugin;
    found += 1;
    const original = hookHandler(plugin.handleHotUpdate);
    const wrapped = async function (context) {
      const started = performance.now();
      summary.compilerPasses.push({ label, file: context.file, status: 'started' });
      try {
        const result = await Reflect.apply(original, this, [context]);
        const event = {
          label,
          file: context.file,
          status: 'success',
          durationMs: performance.now() - started,
        };
        events.push(event);
        summary.compilerPasses.push(event);
        return result;
      } catch (error) {
        const event = {
          label,
          file: context.file,
          status: 'failure',
          durationMs: performance.now() - started,
          error: message(error),
          errorCode: errorCode(error),
        };
        events.push(event);
        summary.compilerPasses.push(event);
        throw error;
      }
    };
    wrapped.__ngdocStyleInstrumented = label;
    return {
      ...plugin,
      handleHotUpdate: replaceHook(plugin.handleHotUpdate, wrapped),
    };
  });
  assert.equal(found, 1, 'Exactly one real Analog Angular compiler plugin is required');
  return { plugins: values, events };
}

async function fixture(label, componentCount = 2) {
  await mkdir(runtime, { recursive: true });
  const root = await mkdtemp(path.join(runtime, `${label}-`));
  fixtures.push(root);
  const put = async (name, content) => {
    const file = path.join(root, name);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content);
    return file;
  };
  const external = await put(
    'src/external.component.ts',
    externalSource('./external.component.scss'),
  );
  const externalStyle = await put(
    'src/external.component.scss',
    '.external { color: rgb(1,2,3); }\n',
  );
  const alternateStyle = await put(
    'src/alternate.component.scss',
    '.external { color: rgb(9,10,11); }\n',
  );
  const inline = await put('src/inline.component.ts', inlineSource('rgb(4,5,6)'));
  const sharedStyle = await put('src/shared.scss', '.shared { color: rgb(60,61,62); }\n');
  const sharedA = await put(
    'src/shared-a.component.ts',
    externalOwnerSource('x-shared-a', 'SharedAComponent', './shared.scss'),
  );
  const sharedB = await put(
    'src/shared-b.component.ts',
    externalOwnerSource('x-shared-b', 'SharedBComponent', './shared.scss'),
  );
  const multiple = await put(
    'src/multiple.component.ts',
    multipleInlineSource('rgb(70,71,72)', 'rgb(73,74,75)'),
  );
  const templateHtml = await put('src/template.component.html', '<p>template initial</p>\n');
  const templateComponent = await put(
    'src/template.component.ts',
    "import {Component} from '@angular/core'; @Component({selector:'x-template',standalone:true,templateUrl:'./template.component.html'}) export class TemplateComponent {}\n",
  );
  const unrelated = await put('src/unrelated.ts', 'export const unrelated = 1;\n');
  for (let index = 0; index < componentCount - 2; index += 1) {
    await put(
      `src/bulk-${index}.component.ts`,
      `import {Component} from '@angular/core'; @Component({selector:'x-bulk-${index}',standalone:true,template:'bulk',styles:['.bulk-${index}{color:rgb(${index % 200},1,2)}']}) export class Bulk${index}Component {}\n`,
    );
  }
  const tsconfig = await put(
    'tsconfig.json',
    JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'bundler',
          experimentalDecorators: true,
          strict: true,
          skipLibCheck: true,
        },
        angularCompilerOptions: { strictTemplates: true },
        include: ['src/**/*.ts'],
      },
      null,
      2,
    ),
  );
  await put('index.html', '<main>style ownership</main>');
  return {
    root,
    external,
    externalStyle,
    alternateStyle,
    inline,
    unrelated,
    sharedStyle,
    sharedA,
    sharedB,
    multiple,
    templateHtml,
    templateComponent,
    tsconfig,
  };
}

function externalSource(styleUrl) {
  return `import {Component} from '@angular/core'; @Component({selector:'x-external',standalone:true,template:'external',styleUrl:${JSON.stringify(styleUrl)}}) export class ExternalComponent {}\n`;
}

function inlineSource(color) {
  return `import {Component} from '@angular/core'; @Component({selector:'x-inline',standalone:true,template:'inline',styles:['.inline { color: ${color}; }']}) export class InlineComponent {}\n`;
}

function externalOwnerSource(selector, className, styleUrl) {
  return `import {Component} from '@angular/core'; @Component({selector:${JSON.stringify(selector)},standalone:true,template:'shared',styleUrl:${JSON.stringify(styleUrl)}}) export class ${className} {}\n`;
}

function multipleInlineSource(first, second, invalidTemplate = false) {
  const template = invalidTemplate ? "'{{ definitelyMissing }}'" : "'first'";
  return `import {Component} from '@angular/core'; @Component({selector:'x-first',standalone:true,template:${template},styles:['.first { color: ${first}; }']}) export class FirstComponent {} @Component({selector:'x-second',standalone:true,template:'second',styles:['.second { color: ${second}; }']}) export class SecondComponent {}\n`;
}

function inlineVirtualName(file, className, data) {
  return `${createHash('sha256')
    .update(file)
    .update(className)
    .update('0')
    .update(data)
    .digest('hex')}.css`;
}

async function start(fixtureValue, packageRoot, label, { throwingLogger = false } = {}) {
  const angular = (await import(pathToFileURL(path.join(packageRoot, 'src/index.js')).href))
    .default;
  const instrumented = instrumentAngular(
    angular({
      tsconfig: fixtureValue.tsconfig,
      workspaceRoot: fixtureValue.root,
      disableTypeChecking: false,
      jit: false,
      liveReload: true,
    }),
    label,
  );
  const logger = createLogger('error');
  const originalError = logger.error.bind(logger);
  logger.error = (value, options) => {
    summary.errors.push({ label, message: String(value), errorCode: errorCode(value) });
    if (throwingLogger) throw new Error('deliberately throwing custom logger');
    originalError(value, options);
  };
  const server = await createServer({
    root: fixtureValue.root,
    cacheDir: path.join(fixtureValue.root, '.vite-cache'),
    configFile: false,
    customLogger: logger,
    logLevel: 'error',
    plugins: instrumented.plugins,
    optimizeDeps: { noDiscovery: true },
    server: { host: '127.0.0.1', port: 0 },
  });
  const resolvedAngular = server.config.plugins.find(
    (plugin) => plugin.name === '@analogjs/vite-plugin-angular',
  );
  const environmentAngular = server.environments.client.plugins.find(
    (plugin) => plugin.name === '@analogjs/vite-plugin-angular',
  );
  summary.resolvedHooks ??= [];
  summary.resolvedHooks.push({
    label,
    handleHotUpdate: typeof resolvedAngular?.handleHotUpdate,
    hotUpdate: typeof resolvedAngular?.hotUpdate,
    environmentHandleHotUpdate: typeof environmentAngular?.handleHotUpdate,
    environmentHotUpdate: typeof environmentAngular?.hotUpdate,
    instrumented:
      hookHandler(environmentAngular?.handleHotUpdate)?.__ngdocStyleInstrumented ?? null,
  });
  servers.add(server);
  await server.listen();
  server.watcher.on('all', (event, file) => {
    summary.nativeEvents.push({ label, event, file });
  });
  await waitFor('Vite native watcher readiness', () => {
    const watched = server.watcher.getWatched();
    return Object.values(watched).some((entries) => entries.includes('unrelated.ts'));
  });
  const address = server.httpServer?.address();
  assert.ok(address && typeof address !== 'string');
  return { server, events: instrumented.events, origin: `http://127.0.0.1:${address.port}` };
}

async function close(host) {
  if (!host || !servers.has(host.server)) return;
  await host.server.environments.client.depsOptimizer?.init();
  await host.server.waitForRequestsIdle();
  await host.server.close();
  servers.delete(host.server);
}

async function transform(host, url) {
  const client = host.server.environments.client;
  const node = await client.moduleGraph.ensureEntryFromUrl(url);
  client.moduleGraph.invalidateModule(node);
  const result = await client.transformRequest(url);
  assert.ok(result?.code, `Missing Angular transform for ${url}`);
  return result.code;
}

function styleName(code, extension) {
  return styleNames(code, extension)[0];
}

function styleNames(code, extension) {
  const matches = [...code.matchAll(new RegExp(`[a-f0-9]{64}\\.${extension}`, 'g'))].map(
    ([match]) => match,
  );
  assert.ok(matches.length, `Missing ${extension} virtual style in Angular output`);
  return [...new Set(matches)];
}

async function styleResponse(host, name, sequence) {
  return fetch(`${host.origin}/${name}?direct&ngcomp=ownership&e=0&v=${sequence}`, {
    headers: { accept: 'text/css' },
  });
}

async function expectStyle(host, name, marker, sequence) {
  const response = await styleResponse(host, name, sequence);
  assert.equal(response.status, 200, `Expected current virtual style ${name}`);
  assert.match(await response.text(), marker);
}

async function expectPruned(host, name, sequence) {
  await waitFor(`pruned style ${name}`, async () => {
    const response = await styleResponse(host, name, `${sequence}-${requestSequence++}`);
    return response.status === 404;
  });
}

async function writeAndWait(host, file, content, status = 'success') {
  const before = host.events.length;
  await writeFile(file, content);
  return waitFor(`${status} compiler pass for ${file}`, () =>
    host.events.slice(before).find((event) => event.file === file && event.status === status),
  );
}

async function expectRecoverableDiagnosticTransform(host, url, marker) {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    await assert.rejects(
      () => transform(host, url),
      (error) =>
        error instanceof Error && error.code === diagnosticCode && error.message.includes(marker),
      `Expected recoverable diagnostic transform rejection ${attempt}`,
    );
  }
}

async function diagnosticNegativeControl(packageRoot) {
  const f = await fixture('negative-control');
  const host = await start(f, packageRoot, 'negative-control');
  try {
    const lastGood = styleName(await transform(host, '/src/inline.component.ts'), 'css');
    await expectStyle(host, lastGood, /rgb\(4,5,6\)/, 'negative-before');
    await writeAndWait(
      host,
      f.inline,
      "import {Component} from '@angular/core'; @Component({selector:'x-inline',standalone:true,template:'{{ definitelyMissing }}',styles:['.inline { color: rgb(90,91,92); }']}) export class InlineComponent {}\n",
      'success',
    );
    const stale = await styleResponse(host, lastGood, `negative-after-${requestSequence++}`);
    assert.equal(
      stale.status,
      404,
      'Unpatched Analog unexpectedly retained the last successful inline style map',
    );
    check('negative-control-nonthrowing-diagnostic-discards-last-good-map', {
      baselinePackage: true,
    });
  } finally {
    await close(host);
  }
}

async function correctness(packageRoot) {
  const f = await fixture('correctness');
  const host = await start(f, packageRoot, 'correctness');
  try {
    const externalInitial = styleName(await transform(host, '/src/external.component.ts'), 'scss');
    const inlineInitial = styleName(await transform(host, '/src/inline.component.ts'), 'css');
    await transform(host, '/src/unrelated.ts');
    await expectStyle(host, externalInitial, /rgb\(1,\s*2,\s*3\)/, 1);
    await expectStyle(host, inlineInitial, /rgb\(4,5,6\)/, 1);

    await writeAndWait(host, f.unrelated, 'export const unrelated = 2;\n');
    await transform(host, '/src/unrelated.ts');
    assert.equal(
      styleName(await transform(host, '/src/external.component.ts'), 'scss'),
      externalInitial,
    );
    assert.equal(
      styleName(await transform(host, '/src/inline.component.ts'), 'css'),
      inlineInitial,
    );
    await expectStyle(host, externalInitial, /rgb\(1,\s*2,\s*3\)/, 2);
    await expectStyle(host, inlineInitial, /rgb\(4,5,6\)/, 2);
    check('unrelated-typescript-preserves-current-external-and-inline-styles');

    // Angular asks for an emulated stylesheet with the component id and for the stylesheet of a
    // component without emulated encapsulation with a bare `ngcomp` flag.
    const emulated = await fetch(`${host.origin}/${externalInitial}?direct&ngcomp=ng-c42&e=0`, {
      headers: { accept: 'text/css' },
    });
    assert.equal(emulated.status, 200);
    assert.match(await emulated.text(), /\.external\[_ngcontent-ng-c42\]/);
    const unscoped = await fetch(`${host.origin}/${externalInitial}?direct&ngcomp&e=2`, {
      headers: { accept: 'text/css' },
    });
    assert.equal(unscoped.status, 200);
    assert.match(unscoped.headers.get('content-type') ?? '', /text\/css/);
    const unscopedText = await unscoped.text();
    assert.match(unscopedText, /\.external\s*\{/);
    assert.doesNotMatch(unscopedText, /_ngcontent/);
    check('component-stylesheets-are-encapsulated-and-flag-only-requests-resolve');

    await writeAndWait(host, f.externalStyle, '.external { color: rgb(7,8,9); }\n');
    await transform(host, '/src/external.component.ts');
    await expectStyle(host, externalInitial, /rgb\(7,\s*8,\s*9\)/, 3);
    await writeAndWait(host, f.externalStyle, '.external { color: rgb(10,11,12); }\n');
    await transform(host, '/src/external.component.ts');
    await expectStyle(host, externalInitial, /rgb\(10,\s*11,\s*12\)/, 4);
    check('repeated-external-style-updates-remain-current');

    await writeAndWait(host, f.external, externalSource('./alternate.component.scss'));
    const externalAlternate = styleName(
      await transform(host, '/src/external.component.ts'),
      'scss',
    );
    assert.notEqual(externalAlternate, externalInitial);
    await expectStyle(host, externalAlternate, /rgb\(9,\s*10,\s*11\)/, 5);
    await expectPruned(host, externalInitial, 5);
    check('external-owner-change-prunes-old-resource-key');

    const inlineSecondSource = inlineSource('rgb(20,21,22)');
    await writeAndWait(host, f.inline, inlineSecondSource);
    const inlineSecond = styleName(await transform(host, '/src/inline.component.ts'), 'css');
    assert.notEqual(inlineSecond, inlineInitial);
    await expectStyle(host, inlineSecond, /rgb\(20,21,22\)/, 6);
    await expectPruned(host, inlineInitial, 6);
    await writeAndWait(host, f.inline, inlineSource('rgb(30,31,32)'));
    const inlineThird = styleName(await transform(host, '/src/inline.component.ts'), 'css');
    assert.notEqual(inlineThird, inlineSecond);
    await expectStyle(host, inlineThird, /rgb\(30,31,32\)/, 7);
    await expectPruned(host, inlineSecond, 7);
    check('repeated-inline-style-updates-prune-old-content-hashes');

    const sharedAInitial = styleName(await transform(host, '/src/shared-a.component.ts'), 'scss');
    const sharedBInitial = styleName(await transform(host, '/src/shared-b.component.ts'), 'scss');
    assert.equal(sharedAInitial, sharedBInitial);
    await expectStyle(host, sharedAInitial, /rgb\(60,\s*61,\s*62\)/, 8);
    await rm(f.sharedA);
    await waitFor('shared owner deletion observation', () =>
      summary.nativeEvents.find((event) => event.event === 'unlink' && event.file === f.sharedA),
    );
    await transform(host, '/src/shared-b.component.ts');
    await waitFor('remaining shared external owner', async () => {
      const response = await styleResponse(host, sharedAInitial, `8-${requestSequence++}`);
      return response.status === 200;
    });
    await rm(f.sharedB);
    await expectPruned(host, sharedAInitial, 9);
    await writeFile(
      f.sharedB,
      externalOwnerSource('x-shared-b', 'SharedBComponent', './shared.scss'),
    );
    const sharedRecreated = await waitFor('recreated shared external owner', async () => {
      try {
        const name = styleName(await transform(host, '/src/shared-b.component.ts'), 'scss');
        const response = await styleResponse(host, name, `10-${requestSequence++}`);
        return response.status === 200 && /rgb\(60,\s*61,\s*62\)/.test(await response.text())
          ? name
          : undefined;
      } catch {
        return undefined;
      }
    });
    assert.equal(sharedRecreated, sharedAInitial);
    await expectStyle(host, sharedRecreated, /rgb\(60,\s*61,\s*62\)/, 10);
    check('shared-external-key-survives-one-owner-and-prunes-after-last-owner');

    const multipleInitial = styleNames(await transform(host, '/src/multiple.component.ts'), 'css');
    assert.equal(multipleInitial.length, 2);
    await Promise.all([
      expectStyle(host, multipleInitial[0], /rgb\((70,71,72|73,74,75)\)/, 11),
      expectStyle(host, multipleInitial[1], /rgb\((70,71,72|73,74,75)\)/, 11),
    ]);
    await writeAndWait(host, f.multiple, multipleInlineSource('rgb(80,81,82)', 'rgb(83,84,85)'));
    const multipleSecond = styleNames(await transform(host, '/src/multiple.component.ts'), 'css');
    assert.equal(multipleSecond.length, 2);
    assert.equal(
      multipleSecond.some((name) => multipleInitial.includes(name)),
      false,
    );
    await Promise.all(multipleInitial.map((name) => expectPruned(host, name, 12)));
    await Promise.all([
      expectStyle(host, multipleSecond[0], /rgb\((80,81,82|83,84,85)\)/, 12),
      expectStyle(host, multipleSecond[1], /rgb\((80,81,82|83,84,85)\)/, 12),
    ]);
    check('multiple-inline-owners-publish-complete-current-pass-and-prune-old-hashes');

    await rm(f.inline);
    await expectPruned(host, inlineThird, 13);
    await writeFile(f.inline, inlineSource('rgb(40,41,42)'));
    await waitFor('inline owner recreation observation', () =>
      summary.nativeEvents.find((event) => event.event === 'add' && event.file === f.inline),
    );
    await writeAndWait(host, f.unrelated, 'export const unrelated = 3;\n');
    await transform(host, '/src/unrelated.ts');
    summary.recreatedInlineObservations = [];
    const recreatedInline = await waitFor(
      'recreated inline owner',
      async () => {
        try {
          const name = styleName(await transform(host, '/src/inline.component.ts'), 'css');
          const response = await styleResponse(host, name, `14-${requestSequence++}`);
          const body = await response.text();
          summary.recreatedInlineObservations.push({
            name,
            status: response.status,
            body: body.slice(0, 120),
          });
          return response.status === 200 && /rgb\(40,41,42\)/.test(body) ? name : undefined;
        } catch {
          return undefined;
        }
      },
      5_000,
    );
    await expectStyle(host, recreatedInline, /rgb\(40,41,42\)/, 14);
    check('deleted-owner-pruned-and-recreated-owner-registered');

    const stableBeforeError = recreatedInline;
    const prospectivePartial = inlineVirtualName(
      f.multiple,
      'FirstComponent',
      '.first { color: rgb(90,91,92); }',
    );
    const failedMultiple = await writeAndWait(
      host,
      f.multiple,
      multipleInlineSource('rgb(90,91,92)', 'rgb(93,94,95)', true),
      'failure',
    );
    assert.equal(failedMultiple.errorCode, diagnosticCode);
    await expectStyle(host, stableBeforeError, /rgb\(40,41,42\)/, 15);
    await Promise.all(
      multipleSecond.map((name) =>
        expectStyle(host, name, /rgb\((80,81,82|83,84,85)\)/, 'diagnostic-last-good'),
      ),
    );
    await expectPruned(host, prospectivePartial, 'diagnostic-partial');
    assert.ok(
      summary.compilerPasses.some(
        (event) =>
          event.file === f.multiple &&
          event.status === 'failure' &&
          event.errorCode === diagnosticCode &&
          event.error.includes('definitelyMissing'),
      ),
      'Invalid compiler pass did not fail the registry boundary',
    );
    await expectRecoverableDiagnosticTransform(
      host,
      '/src/multiple.component.ts',
      'definitelyMissing',
    );
    const recoveredMultipleSource = multipleInlineSource('rgb(100,101,102)', 'rgb(103,104,105)');
    await writeAndWait(host, f.multiple, recoveredMultipleSource);
    const recoveredMultiple = styleNames(
      await transform(host, '/src/multiple.component.ts'),
      'css',
    );
    assert.equal(recoveredMultiple.length, 2);
    assert.equal(
      recoveredMultiple.some((name) => multipleSecond.includes(name)),
      false,
    );
    await Promise.all(
      multipleSecond.map((name) => expectPruned(host, name, 'diagnostic-repaired')),
    );
    await Promise.all([
      expectStyle(
        host,
        recoveredMultiple[0],
        /rgb\((100,101,102|103,104,105)\)/,
        'diagnostic-repaired',
      ),
      expectStyle(
        host,
        recoveredMultiple[1],
        /rgb\((100,101,102|103,104,105)\)/,
        'diagnostic-repaired',
      ),
    ]);
    check('template-end-pass-diagnostic-retains-last-good-and-recovers-in-same-angular-instance');

    const recovered = styleName(await transform(host, '/src/inline.component.ts'), 'css');
    await expectStyle(host, recovered, /rgb\(40,41,42\)/, 16);

    const errorsBeforeInvalidAdd = summary.errors.length;
    const invalidNew = path.join(f.root, 'src/invalid-new.component.ts');
    await writeFile(
      invalidNew,
      "import {Component} from '@angular/core'; @Component({selector:'x-invalid-new',standalone:true,template:'{{ missingOnNewOwner }}',styles:['.new { color: red; }']}) export class InvalidNewComponent {}\n",
    );
    await waitFor('invalid new owner native add', () =>
      summary.nativeEvents.find((event) => event.event === 'add' && event.file === invalidNew),
    );
    const reported = await waitFor('invalid new owner diagnostic report', () =>
      summary.errors
        .slice(errorsBeforeInvalidAdd)
        .find((entry) => entry.errorCode === diagnosticCode),
    );
    assert.equal(reported.errorCode, diagnosticCode);
    assert.match(reported.message, /missingOnNewOwner/);
    await expectRecoverableDiagnosticTransform(
      host,
      '/src/inline.component.ts',
      'missingOnNewOwner',
    );
    await expectStyle(host, recovered, /rgb\(40,41,42\)/, 17);
    check('invalid-new-owner-rejects-public-transform-without-unhandled-rejection');
  } finally {
    await close(host);
  }
}

async function typeScriptDiagnosticRecovery(packageRoot) {
  const f = await fixture('typescript-diagnostic-recovery');
  const host = await start(f, packageRoot, 'typescript-diagnostic-recovery');
  try {
    const lastGood = styleName(await transform(host, '/src/inline.component.ts'), 'css');
    await expectStyle(host, lastGood, /rgb\(4,5,6\)/, 'typescript-before');
    const failed = await writeAndWait(
      host,
      f.unrelated,
      'export const unrelated: string = 1;\n',
      'failure',
    );
    assert.equal(failed.errorCode, diagnosticCode);
    assert.match(failed.error, /not assignable to type 'string'/);
    await expectStyle(host, lastGood, /rgb\(4,5,6\)/, 'typescript-last-good');
    await expectRecoverableDiagnosticTransform(
      host,
      '/src/inline.component.ts',
      "not assignable to type 'string'",
    );
    await writeAndWait(host, f.unrelated, "export const unrelated: string = 'repaired';\n");
    await writeAndWait(host, f.inline, inlineSource('rgb(54,55,56)'));
    const repaired = styleName(await transform(host, '/src/inline.component.ts'), 'css');
    assert.notEqual(repaired, lastGood);
    await expectStyle(host, repaired, /rgb\(54,55,56\)/, 'typescript-repaired');
    await expectPruned(host, lastGood, 'typescript-repaired');
    check('typescript-end-pass-diagnostic-retains-last-good-and-recovers-in-same-angular-instance');
  } finally {
    await close(host);
  }
}

async function fatalCompilerHookRecovery(packageRoot) {
  const f = await fixture('fatal-compiler-hook');
  let host;
  try {
    host = await start(f, packageRoot, 'fatal-compiler-hook');
    const lastGood = styleName(await transform(host, '/src/inline.component.ts'), 'css');
    await expectStyle(host, lastGood, /rgb\(4,5,6\)/, 'fatal-before');
    globalThis[fatalAnalyzeHook] = () => {
      delete globalThis[fatalAnalyzeHook];
      throw new Error('injected fatal Angular analysis exception');
    };
    const firstFailure = await writeAndWait(
      host,
      f.unrelated,
      'export const unrelated = 2;\n',
      'failure',
    );
    assert.equal(firstFailure.errorCode, undefined);
    assert.match(firstFailure.error, /injected fatal Angular analysis exception/);
    await expectStyle(host, lastGood, /rgb\(4,5,6\)/, 'fatal-last-good');
    await assert.rejects(
      () => transform(host, '/src/inline.component.ts'),
      /injected fatal Angular analysis exception/,
    );
    const laterFailure = await writeAndWait(
      host,
      f.unrelated,
      'export const unrelated = 3;\n',
      'failure',
    );
    assert.equal(laterFailure.errorCode, undefined);
    await assert.rejects(
      () => transform(host, '/src/inline.component.ts'),
      /injected fatal Angular analysis exception/,
    );
    await close(host);
    host = undefined;
    await writeFile(f.inline, inlineSource('rgb(57,58,59)'));
    host = await start(f, packageRoot, 'fatal-compiler-hook-fresh-recovery');
    const repaired = styleName(await transform(host, '/src/inline.component.ts'), 'css');
    assert.notEqual(repaired, lastGood);
    await expectStyle(host, repaired, /rgb\(57,58,59\)/, 'fatal-fresh-recovery');
    check('arbitrary-angular-analysis-exception-remains-terminal-until-fresh-factory');
  } finally {
    delete globalThis[fatalAnalyzeHook];
    await close(host);
  }
}

async function prepareFatalCompilerCopy(sourceRoot, destination) {
  await rm(destination, { recursive: true, force: true });
  await cp(sourceRoot, destination, { recursive: true });
  const sourcePath = path.join(destination, 'src/lib/angular-vite-plugin.js');
  const source = await readFile(sourcePath, 'utf8');
  const before = `        if (angularCompiler) {
            await angularCompiler.analyzeAsync();
        }`;
  const after = `        if (angularCompiler) {
            await angularCompiler.analyzeAsync();
            // Test-only fault seam: it runs after real Angular analysis, inside _doPerformCompilation.
            globalThis.${fatalAnalyzeHook}?.();
        }`;
  assert.equal(
    source.split(before).length,
    2,
    'Expected exactly one Angular analysis fault injection anchor',
  );
  await writeFile(sourcePath, source.replace(before, after));
  return {
    sourcePath,
    before,
    after,
    sha256: digest(await readFile(sourcePath)),
  };
}

async function resourceDiagnostic(packageRoot) {
  const f = await fixture('resource-diagnostic');
  const host = await start(f, packageRoot, 'resource-diagnostic');
  try {
    const lastGood = styleName(await transform(host, '/src/inline.component.ts'), 'css');
    await expectStyle(host, lastGood, /rgb\(4,5,6\)/, 'resource-before');
    const errorsBefore = summary.errors.length;
    await writeAndWait(host, f.templateHtml, '<p>{{ 1 + }}</p>\n', 'success');
    const reported = await waitFor('external template diagnostic report', () =>
      summary.errors.slice(errorsBefore).find((entry) => entry.errorCode === diagnosticCode),
    );
    assert.equal(reported.errorCode, diagnosticCode);
    assert.match(reported.message, /template\.component\.html|Parser Error/);
    await expectRecoverableDiagnosticTransform(
      host,
      '/src/template.component.ts',
      'template.component.html',
    );
    await expectStyle(host, lastGood, /rgb\(4,5,6\)/, 'resource-last-good');
    await writeAndWait(host, f.templateHtml, '<p>template repaired</p>\n');
    assert.match(await transform(host, '/src/template.component.ts'), /template repaired/);
    check('external-template-end-pass-diagnostic-recovers-in-same-angular-instance');
  } finally {
    await close(host);
  }
}

async function throwingLoggerDiagnostic(packageRoot) {
  const f = await fixture('throwing-logger');
  const unhandled = [];
  const onUnhandled = (reason) => unhandled.push(message(reason));
  process.on('unhandledRejection', onUnhandled);
  const host = await start(f, packageRoot, 'throwing-logger', { throwingLogger: true });
  try {
    await transform(host, '/src/inline.component.ts');
    await writeAndWait(host, f.templateHtml, '<p>{{ 1 + }}</p>\n', 'success');
    await assert.rejects(
      () => transform(host, '/src/template.component.ts'),
      (error) =>
        error instanceof Error &&
        error.code === diagnosticCode &&
        !error.message.includes('deliberately throwing custom logger'),
    );
    await writeAndWait(host, f.templateHtml, '<p>logger repaired</p>\n');
    assert.match(await transform(host, '/src/template.component.ts'), /logger repaired/);
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(unhandled, []);
    check('throwing-custom-logger-cannot-replace-or-float-recoverable-compiler-diagnostic');
  } finally {
    process.off('unhandledRejection', onUnhandled);
    await close(host);
  }
}

async function measureCompilationCost(packageRoot, mode) {
  const f = await fixture(`performance-${mode}`, 42);
  const host = await start(f, packageRoot, `performance-${mode}`);
  try {
    await transform(host, '/src/unrelated.ts');
    const durations = [];
    for (let index = 2; index <= 6; index += 1) {
      const event = await writeAndWait(host, f.unrelated, `export const unrelated = ${index};\n`);
      durations.push(event.durationMs);
    }
    return {
      mode,
      componentCount: 42,
      passes: durations.length,
      durationsMs: durations,
      medianMs: [...durations].sort((a, b) => a - b)[Math.floor(durations.length / 2)],
      totalMs: durations.reduce((sum, value) => sum + value, 0),
    };
  } finally {
    await close(host);
  }
}

try {
  assert.equal(summary.runtime.node, 'v24.19.0');
  const packageRoot = path.join(repository, 'node_modules/@analogjs/vite-plugin-angular');
  const preparedRoot = path.join(runtime, 'run-copy');
  const baselineRoot = path.join(runtime, 'baseline-copy');
  const fatalRoot = path.join(runtime, 'fatal-copy');
  const patch = await prepareAnalogCopy({
    packageRoot,
    destination: preparedRoot,
    mode: 'full-reset',
  });
  const baselinePatch = await prepareAnalogCopy({
    packageRoot,
    destination: baselineRoot,
    mode: 'baseline',
  });
  summary.patch = {
    mode: patch.mode,
    packageVersion: patch.packageVersion,
    originalPackageDigest: patch.originalPackageDigest,
    copiedPackageDigest: patch.copiedPackageDigest,
    changedFiles: patch.changedFiles,
    changeLabels: patch.changes.map(({ label }) => label),
  };
  summary.baselinePatch = {
    mode: baselinePatch.mode,
    packageVersion: baselinePatch.packageVersion,
    originalPackageDigest: baselinePatch.originalPackageDigest,
    copiedPackageDigest: baselinePatch.copiedPackageDigest,
    changedFiles: baselinePatch.changedFiles,
    changeLabels: baselinePatch.changes.map(({ label }) => label),
  };
  summary.patchProvenance = { patch, baselinePatch };
  const preparedMainSource = path.join(preparedRoot, 'src/lib/angular-vite-plugin.js');
  assert.equal(
    digest(await readFile(preparedMainSource)),
    analogResourcePolicy.patchedMainSourceSha256,
    'Normal prepared copy must be exactly the shipped patched Analog source',
  );
  summary.fatalFaultInjection = {
    normalPreparedSha256: digest(await readFile(preparedMainSource)),
    ...(await prepareFatalCompilerCopy(preparedRoot, fatalRoot)),
  };
  if (process.env.NGDOC_ANALOG_STYLE_RESOURCE_ONLY !== '1') {
    await diagnosticNegativeControl(baselineRoot);
    await correctness(preparedRoot);
    await typeScriptDiagnosticRecovery(preparedRoot);
    await fatalCompilerHookRecovery(fatalRoot);
  }
  await resourceDiagnostic(preparedRoot);
  await throwingLoggerDiagnostic(preparedRoot);
  if (process.env.NGDOC_ANALOG_STYLE_SKIP_PERFORMANCE !== '1') {
    summary.performance = {
      baseline: await measureCompilationCost(baselineRoot, 'baseline-incremental'),
      fullReset: await measureCompilationCost(preparedRoot, 'full-program-reset'),
    };
    check('full-program-reset-cost-measured', summary.performance);
  }
  summary.status = 'passed';
} catch (error) {
  summary.status = 'failed';
  summary.failure = message(error);
  process.exitCode = 1;
} finally {
  const cleanup = await Promise.allSettled([...servers].map((server) => server.close()));
  servers.clear();
  summary.cleanup.serverErrors = cleanup
    .filter((result) => result.status === 'rejected')
    .map((result) => message(result.reason));
  for (const root of fixtures) await rm(root, { recursive: true, force: true });
  await rm(path.join(runtime, 'fatal-copy'), { recursive: true, force: true });
  summary.cleanup.fixturesRemoved = fixtures.every((root) => !existsSync(root));
  summary.cleanup.openServers = servers.size;
  if (summary.cleanup.serverErrors.length || !summary.cleanup.fixturesRemoved) {
    summary.status = 'failed';
    process.exitCode = 1;
  }
  await mkdir(evidence, { recursive: true });
  if (summary.patchProvenance) {
    await writeFile(
      path.join(evidence, 'patch-provenance.json'),
      `${JSON.stringify(summary.patchProvenance, null, 2)}\n`,
    );
    delete summary.patchProvenance;
  }
  await writeFile(path.join(evidence, 'results.json'), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify({ status: summary.status, checks: summary.checks.length }));
}
