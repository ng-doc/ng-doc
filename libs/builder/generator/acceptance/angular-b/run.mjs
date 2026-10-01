import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { parse } from 'parse5';
import { fileURLToPath } from 'node:url';

const harness = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(harness, '../../../../..');
const evidence = path.join(repository, 'docs/architecture/evidence/t12/angular-b');
const runtimeRoot = path.join(harness, '.runtime');
await mkdir(runtimeRoot, { recursive: true });
const runtimeParent = await mkdtemp(path.join(runtimeRoot, '.ng-doc-angular-b-'));
const workspace = path.join(runtimeParent, '.dotted-parent', 'workspace');
const generatedRoot = path.join(workspace, 'generated-output/ng-doc/bfixture');
const outputRoot = path.join(workspace, 'dist/bfixture');
const packageSnapshot = path.join(workspace, 'node_modules/@ng-doc/builder');
const unopenedMarkdown = 'docs/outer/inner/unopened/index.md.nunj';
const unopenedContent = `# Unopened production guide\n\nThis page exists to exercise production admission.\n`;
const ngCli = path.join(repository, 'node_modules/@angular/cli/bin/ng.js');
const sourceDigestAtStartup = createHash('sha256')
  .update(await readFile(new URL(import.meta.url)))
  .digest('hex');
const browserErrors = [];
const failedResponses = [];
const expectedBrowserErrorIndexes = new Set();
const expectedFailedResponseIndexes = new Set();
const events = [];
const summary = {
  runtime: process.version,
  workspace,
  dottedAncestor: path.basename(path.dirname(workspace)),
  generatedRoot,
  checks: {},
  limitations: [],
};
let browser;
let dev;
let ssr;

await mkdir(evidence, { recursive: true });
await mkdir(workspace, { recursive: true });

function mark(event, detail = {}) {
  const record = { event, at: new Date().toISOString(), ...detail };
  events.push(record);
  console.log(event, JSON.stringify(detail));
}

async function put(relative, content) {
  const target = path.join(workspace, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content);
  return target;
}

async function reservePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert(address && typeof address !== 'string');
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}

async function createFixture() {
  for (const packageName of ['app', 'builder', 'core', 'keywords-loaders', 'ui-kit', 'utils']) {
    await cp(
      path.join(repository, 'dist/libs', packageName),
      path.join(workspace, 'node_modules/@ng-doc', packageName),
      { recursive: true },
    );
  }
  await cp(
    path.join(workspace, 'node_modules/@ng-doc/ui-kit/assets'),
    path.join(workspace, 'public/assets/ng-doc/ui-kit'),
    { recursive: true },
  );
  await mkdir(path.join(workspace, 'public/assets/icons'), { recursive: true });
  await cp(
    path.join(workspace, 'node_modules/@ng-doc/ui-kit/assets/icons/16/code.svg'),
    path.join(workspace, 'public/assets/icons/code.svg'),
  );
  const provenance = JSON.parse(
    await readFile(path.join(packageSnapshot, 'generator/build-provenance.json'), 'utf8'),
  );
  summary.package = {
    source: 'copied final dist/libs/builder snapshot',
    compilerVersion: provenance.compilerVersion,
    toolchainDigest: provenance.toolchainDigest,
    sourceDigest: provenance.sourceDigest,
    appHighlighterDigest: createHash('sha256')
      .update(
        await readFile(
          path.join(
            workspace,
            'node_modules/@ng-doc/app/fesm2022/ng-doc-app-services-highlighter.mjs',
          ),
        ),
      )
      .digest('hex'),
    appPageLinkDigest: createHash('sha256')
      .update(
        await readFile(
          path.join(
            workspace,
            'node_modules/@ng-doc/app/fesm2022/ng-doc-app-components-page-link.mjs',
          ),
        ),
      )
      .digest('hex'),
    uiKitTokensDigest: createHash('sha256')
      .update(
        await readFile(
          path.join(workspace, 'node_modules/@ng-doc/ui-kit/fesm2022/ng-doc-ui-kit-tokens.mjs'),
        ),
      )
      .digest('hex'),
  };
  await put('package.json', '{"name":"angular-b-fixture","private":true,"type":"module"}\n');
  await put(
    'angular.json',
    `${JSON.stringify(
      {
        version: 1,
        cli: { analytics: false, cache: { enabled: false } },
        projects: {
          bfixture: {
            projectType: 'application',
            root: '',
            sourceRoot: 'src',
            prefix: 'b',
            architect: {
              build: {
                builder: '@ng-doc/builder:modern-application',
                options: {
                  outputPath: 'dist/bfixture',
                  index: 'src/index.html',
                  browser: 'src/main.ts',
                  server: 'src/main.server.ts',
                  ssr: { entry: 'server.ts' },
                  prerender: true,
                  polyfills: ['zone.js'],
                  tsConfig: 'tsconfig.app.json',
                  inlineStyleLanguage: 'scss',
                  baseHref: '/preview/',
                  assets: [{ glob: '**/*', input: 'public', output: '/' }],
                  styles: ['node_modules/@ng-doc/app/styles/global.css'],
                  scripts: [],
                  ngDoc: { config: 'ng-doc.config.ts' },
                },
                configurations: {
                  development: {
                    optimization: false,
                    sourceMap: true,
                    namedChunks: true,
                    extractLicenses: false,
                  },
                  production: {
                    optimization: false,
                    sourceMap: true,
                    extractLicenses: false,
                  },
                },
              },
              serve: {
                builder: '@ng-doc/builder:modern-dev-server',
                configurations: {
                  development: { buildTarget: 'bfixture:build:development' },
                },
                defaultConfiguration: 'development',
              },
            },
          },
        },
      },
      null,
      2,
    )}\n`,
  );
  await put(
    'tsconfig.app.json',
    `${JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'ES2022',
          moduleResolution: 'bundler',
          experimentalDecorators: true,
          useDefineForClassFields: false,
          strict: true,
          skipLibCheck: true,
          importHelpers: true,
          ignoreDeprecations: '6.0',
          baseUrl: '.',
          paths: {
            '@ng-doc/generated': ['generated-output/ng-doc/bfixture/index.ts'],
            '@ng-doc/generated/*': ['generated-output/ng-doc/bfixture/*'],
          },
          types: ['node'],
        },
        angularCompilerOptions: {
          strictTemplates: true,
          strictInjectionParameters: true,
        },
        include: ['src/**/*.ts', 'docs/**/*.ts', 'generated-output/**/*.ts', 'server.ts'],
      },
      null,
      2,
    )}\n`,
  );
  await put(
    'ng-doc.config.ts',
    `export default {
  docsPath: 'docs',
  routePrefix: 'docs',
  tsConfig: 'tsconfig.app.json',
  outDir: 'generated-output',
  cache: true,
  guide: { anchorHeadings: ['h1', 'h2', 'h3'] },
  repoConfig: { url: 'https://github.com/example/angular-b', platform: 'github', mainBranch: 'main' },
  shiki: { themes: { light: 'github-light', dark: 'ayu-dark' } },
};
`,
  );
  await put(
    'src/token.ts',
    `import { InjectionToken } from '@angular/core';
export const FEATURE_SCOPE = new InjectionToken<string>('FEATURE_SCOPE');
`,
  );
  await put(
    'src/feature.ts',
    `import { Component, inject, input, model } from '@angular/core';
import { FEATURE_SCOPE } from './token';

@Component({
  selector: 'feature-card',
  standalone: true,
  templateUrl: './feature.html',
  styleUrl: './feature.scss',
})
export class FeatureComponent {
  readonly scope = inject(FEATURE_SCOPE);
  readonly label = input('Default label', { alias: 'labelAlias' });
  readonly amount = model(2, { alias: 'amountAlias' });
  readonly requiredValue = model.required<string>({ alias: 'requiredAlias' });
  increment(): void { this.amount.update((value) => value + 1); }
}
`,
  );
  await put(
    'src/feature.html',
    `<article data-testid="feature">
  <button data-testid="counter" (click)="increment()">{{ label() }} {{ amount() }}</button>
  <span data-testid="required">{{ requiredValue() }}</span>
  <span data-testid="scope">{{ scope }}</span>
</article>
`,
  );
  await put(
    'src/feature.scss',
    `$accent: rgb(17, 91, 177);
[data-testid='counter'] { background-color: $accent; color: white; }
`,
  );
  await put(
    'src/legacy.ts',
    `import { Component, inject, Input, NgModule } from '@angular/core';
import { FEATURE_SCOPE } from './token';

@Component({
  selector: 'legacy-card',
  standalone: false,
  template: '<span data-testid="legacy-demo">{{ value }} {{ scope }}</span>',
})
export class LegacyComponent {
  @Input() value = 'legacy-default';
  readonly scope = inject(FEATURE_SCOPE);
}

@NgModule({ declarations: [LegacyComponent], exports: [LegacyComponent] })
export class LegacyModule {}
`,
  );
  await put(
    'src/api-base.ts',
    `/** External base docs. */
export class ExternalBase {
  /** Inherited label. */ inherited = 'base';
}
`,
  );
  await put(
    'src/api.ts',
    `import { ExternalBase } from './api-base';

/**
 * Widget API summary.
 * @remarks Multiline remarks for the browser contract.
 * @example
 * const value = new WidgetApi().greet('world@example.com');
 */
export class WidgetApi extends ExternalBase {
  /**
   * Greets a value.
   * @param value - A value containing @ when needed.
   * @returns The rendered greeting.
   */
  greet(value: string): string { return 'Hello ' + value; }
}

/** Options used by WidgetApi. */
export interface WidgetOptions { label: string; count?: number; }
`,
  );
  await put(
    'docs/outer/ng-doc.category.ts',
    `import { FEATURE_SCOPE } from '../../src/token';
const OuterCategory = {
  title: 'Outer category', route: 'outer', order: 2, expanded: false,
  providers: [{ provide: FEATURE_SCOPE, useValue: 'outer-provider' }],
};
export default OuterCategory;
`,
  );
  await put(
    'docs/outer/inner/ng-doc.category.ts',
    `import { FEATURE_SCOPE } from '../../../src/token';
import OuterCategory from '../ng-doc.category';
const InnerCategory = {
  title: 'Inner category', route: 'inner', order: 1, expanded: true,
  category: OuterCategory,
  providers: [{ provide: FEATURE_SCOPE, useValue: 'inner-provider' }],
};
export default InnerCategory;
`,
  );
  await put(
    'docs/outer/outer-page/ng-doc.page.ts',
    `import OuterCategory from '../ng-doc.category';
import { FeatureComponent } from '../../../src/feature';
const Page = {
  title: 'Outer provider page', route: 'outer-page', category: OuterCategory,
  mdFile: './index.md.nunj', demos: { Feature: FeatureComponent },
};
export default Page;
`,
  );
  await put(
    'docs/outer/outer-page/index.md.nunj',
    `---
keyword: OuterGuide
---
# Outer provider page

## Outer Anchor

Cycle back to \`*FeatureGuide#unicode-привет\`.

{{ NgDocActions.demo("Feature", {inputs: {labelAlias: "Outer", amountAlias: 1, requiredAlias: "outer-required"} }) }}
`,
  );
  await put(
    'docs/outer/inner/guide/ng-doc.page.ts',
    `import InnerCategory from '../ng-doc.category';
import { FeatureComponent } from '../../../../src/feature';
import { LegacyComponent, LegacyModule } from '../../../../src/legacy';
const Page = {
  title: 'Feature \\x60guide\\x60 \${value}', route: 'guide', category: InnerCategory, order: 1,
  mdFile: ['./overview.md.nunj', './details.md.nunj'],
  demos: { Feature: FeatureComponent, Legacy: LegacyComponent },
  imports: [LegacyModule],
  playgrounds: {
    feature: {
      target: FeatureComponent,
      template: '<feature-card></feature-card>',
      inputs: { label: 'Initial "quoted" \\\\ path ☃', amount: 4, requiredValue: 'required-start' },
      defaults: { label: 'Reset label', amount: 2, requiredValue: 'required-reset' },
      controls: {
        label: { type: 'string', alias: 'labelAlias', description: 'Manual label ☃' },
      },
    },
  },
};
export default Page;
`,
  );
  await put('docs/shared.md.nunj', '<p id="shared-marker">Shared include version one</p>\n');
  await put(
    'docs/outer/inner/guide/overview.md.nunj',
    `---
title: Overview ☃
route: ''
keyword: FeatureGuide
---
# Feature Guide

## Unicode Привет

Forward/cyclic page link: \`*OuterGuide#outer-anchor\`.

[Query](?mode=test#unicode-привет)
[Mail](mailto:docs@example.com)
[Local anchor](#unicode-привет)
[Same origin](/docs/outer/outer-page)

{% include "../../../shared.md.nunj" %}

{{ NgDocActions.demo("Feature", {expanded: true, inputs: {labelAlias: "Demo", amountAlias: 2, requiredAlias: "demo-required"} }) }}

{{ NgDocActions.demo("Legacy", {inputs: {value: "legacy-demo"} }) }}

{{ NgDocActions.playground("feature") }}

\`\`\`mermaid
graph TD
  A[Visible Mermaid Label] --> B[End]
\`\`\`
`,
  );
  await put(
    'docs/outer/inner/guide/details.md.nunj',
    `---
title: Details
route: details
---
# Details tab

{% include "../../../shared.md.nunj" %}

<p id="details-marker">Second tab content</p>

\`\`\`ts name="Named client" icon="code"
const visible = '@ in fenced code';
\`\`\`
`,
  );
  await put(
    'docs/outer/inner/ng-doc.api.ts',
    `import InnerCategory from './ng-doc.category';
const Api = {
  title: 'Reference API', route: 'reference', category: InnerCategory,
  scopes: [{ name: 'Public', route: 'public', include: ['src/api.ts'] }],
};
export default Api;
`,
  );
  await put(
    'docs/outer/inner/unopened/ng-doc.page.ts',
    `import InnerCategory from '../ng-doc.category';
const Page = {
  title: 'Unopened production guide', route: 'unopened', category: InnerCategory,
  mdFile: './index.md.nunj',
};
export default Page;
`,
  );
  await put(unopenedMarkdown, unopenedContent);
  await put(
    'docs/collapsed/ng-doc.category.ts',
    `const Category = {
  title: 'Collapsed category', route: 'collapsed', order: 9, expanded: false,
};
export default Category;
`,
  );
  await put(
    'docs/collapsed/page/ng-doc.page.ts',
    `import Category from '../ng-doc.category';
const Page = {
  title: 'Collapsed child', route: 'page', category: Category, mdFile: './index.md.nunj',
};
export default Page;
`,
  );
  await put(
    'docs/collapsed/page/index.md.nunj',
    '# Collapsed child\n\nThis route proves collapsed sidebar link rendering.\n',
  );
  await put(
    'src/app.ts',
    `import { Component } from '@angular/core';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideRouter, RouterOutlet } from '@angular/router';
import { provideClientHydration, withNoIncrementalHydration } from '@angular/platform-browser';
import { NgDocSidebarComponent, provideNgDocApp, providePageSkeleton, provideMainPageProcessor, NG_DOC_DEFAULT_PAGE_PROCESSORS } from '@ng-doc/app';
import { NgDocRootComponent } from '@ng-doc/app/components/root';
import { provideMermaid } from '@ng-doc/app/providers/mermaid';
import { provideNgDocContext } from '@ng-doc/generated';
import { NG_DOC_ROUTING } from '@ng-doc/generated';

@Component({
  selector: 'b-root', standalone: true,
  imports: [RouterOutlet, NgDocRootComponent, NgDocSidebarComponent],
  template: '<ng-doc-root [sidebar]="true"><ng-doc-sidebar></ng-doc-sidebar><router-outlet></router-outlet></ng-doc-root>',
})
export class App {}

export const appProviders = [
  provideRouter([
    { path: 'docs', children: NG_DOC_ROUTING },
    { path: '', pathMatch: 'full', redirectTo: 'docs' },
  ]),
  provideHttpClient(withInterceptorsFromDi()),
  provideClientHydration(withNoIncrementalHydration()),
  ...provideNgDocApp(),
  provideMermaid(),
  ...providePageSkeleton({}),
  ...provideMainPageProcessor(NG_DOC_DEFAULT_PAGE_PROCESSORS),
  ...provideNgDocContext(),
];
`,
  );
  await put(
    'src/main.ts',
    `import { bootstrapApplication } from '@angular/platform-browser';
import { App, appProviders } from './app';
bootstrapApplication(App, {providers: appProviders})
  .then(() => document.body.dataset['bootstrapped'] = 'true')
  .catch((error) => document.body.dataset['bootstrapError'] = String(error));
`,
  );
  await put(
    'src/main.server.ts',
    `import { provideServerRendering } from '@angular/platform-server';
import { bootstrapApplication, BootstrapContext } from '@angular/platform-browser';
import { App, appProviders } from './app';
export default (context: BootstrapContext) => bootstrapApplication(
  App, {providers: [...appProviders, provideServerRendering()]}, context,
);
`,
  );
  await put(
    'server.ts',
    `import 'zone.js/node';
import { APP_BASE_HREF } from '@angular/common';
import { CommonEngine, isMainModule } from '@angular/ssr/node';
import express from 'express';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import bootstrap from './src/main.server';
export function app() {
  const server = express();
  const browser = join(import.meta.dirname, '../browser');
  const index = join(import.meta.dirname, 'index.server.html');
  const document = readFileSync(index, 'utf8');
  server.use('/preview', express.static(browser, {maxAge: '1y'}));
  server.get('*', (req, res, next) => {
    new CommonEngine().render({
      bootstrap, document, documentFilePath: index,
      url: req.protocol + '://' + req.headers.host + req.originalUrl,
      publicPath: browser,
      providers: [{provide: APP_BASE_HREF, useValue: '/preview'}],
    }).then((html) => res.send(html)).catch(next);
  });
  return server;
}
if (isMainModule(import.meta.url)) {
  app().listen(Number(process.env['PORT'] ?? 4000), '127.0.0.1');
}
export default bootstrap;
`,
  );
  await put(
    'src/index.html',
    '<!doctype html><html><head><base href="/preview/"><title>Angular B</title><link rel="icon" href="data:,"></head><body><b-root></b-root></body></html>',
  );
}

function spawnLogged(name, args, extraEnv = {}) {
  const child = spawn(process.execPath, [ngCli, ...args], {
    cwd: workspace,
    env: { ...process.env, CI: '1', NO_COLOR: '1', FORCE_COLOR: '0', ...extraEnv },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let text = '';
  const append = (chunk) => {
    text += String(chunk);
  };
  child.stdout.on('data', append);
  child.stderr.on('data', append);
  const closed = once(child, 'close').then(([code, signal]) => ({ code, signal, text }));
  return { name, child, closed, text: () => text };
}

async function runCommand(name, args, timeoutMs = 180_000) {
  const command = spawnLogged(name, args);
  let timer;
  const result = await Promise.race([
    command.closed,
    new Promise((_, reject) => {
      timer = setTimeout(() => {
        command.child.kill('SIGTERM');
        reject(new Error(`${name} exceeded ${timeoutMs}ms`));
      }, timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer));
  await writeFile(path.join(evidence, `${name}.log`), result.text);
  assert.equal(result.code, 0, `${name} failed (${result.code}):\n${result.text.slice(-4000)}`);
  return result.text;
}

async function runExpectedFailure(name, args, timeoutMs = 60_000) {
  const command = spawnLogged(name, args);
  let timer;
  const result = await Promise.race([
    command.closed,
    new Promise((_, reject) => {
      timer = setTimeout(() => {
        command.child.kill('SIGTERM');
        reject(new Error(`${name} exceeded ${timeoutMs}ms`));
      }, timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer));
  await writeFile(path.join(evidence, `${name}.log`), result.text);
  assert.notEqual(result.code, 0, `${name} unexpectedly succeeded:\n${result.text.slice(-4000)}`);
  return result;
}

async function waitUntil(predicate, timeoutMs, label, signal, terminalFailure) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    if (signal?.aborted) throw signal.reason;
    const terminal = terminalFailure?.();
    if (terminal) throw new Error(terminal);
    try {
      last = await predicate();
      if (last) return last;
    } catch (error) {
      last = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`${label} timed out: ${String(last)}`);
}

async function waitHttp(url, timeoutMs = 180_000, signal, terminalFailure) {
  return waitUntil(
    async () => {
      const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
      return response.ok && response;
    },
    timeoutMs,
    `HTTP ${url}`,
    signal,
    terminalFailure,
  );
}

async function fileExists(file) {
  try {
    return (await stat(file)).isFile();
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function waitForLogSince(command, offset, pattern, label, timeoutMs = 90_000) {
  return waitUntil(async () => pattern.test(command.text().slice(offset)), timeoutMs, label);
}

async function readKeywords(origin) {
  const response = await fetch(`${origin}/preview/assets/ng-doc/keywords.json`, {
    signal: AbortSignal.timeout(10_000),
  });
  assert.equal(response.status, 200);
  return response.json();
}

function findElement(root, predicate) {
  if (root?.tagName && predicate(root)) return root;
  for (const child of root?.childNodes ?? []) {
    const match = findElement(child, predicate);
    if (match) return match;
  }
  return undefined;
}

function elementText(root) {
  if (root?.nodeName === '#text') return root.value ?? '';
  return (root?.childNodes ?? []).map(elementText).join('');
}

function attribute(element, name) {
  return element?.attrs?.find((item) => item.name === name)?.value;
}

async function stopProcess(command, label) {
  if (!command || command.child.exitCode !== null) return;
  command.child.kill('SIGINT');
  let timer;
  const result = await Promise.race([
    command.closed,
    new Promise((resolve) => {
      timer = setTimeout(() => {
        command.child.kill('SIGTERM');
        resolve(undefined);
      }, 20_000);
    }),
  ]).finally(() => clearTimeout(timer));
  if (!result) await command.closed;
  mark(`${label}:stopped`);
}

async function readIndexes(origin) {
  const response = await fetch(`${origin}/preview/assets/ng-doc/indexes.json`, {
    signal: AbortSignal.timeout(10_000),
  });
  assert.equal(response.status, 200);
  return response.json();
}

function acceptIntentionalBrowserFailures(label, errorOffset, responseOffset, origin) {
  const errors = browserErrors.slice(errorOffset);
  const responses = failedResponses.slice(responseOffset);
  const serverErrors = errors.filter(
    (error) =>
      error.message ===
      'Failed to load resource: the server responded with a status of 500 (Internal Server Error)',
  );
  const faviconErrors = errors.filter(
    (error) =>
      error.message ===
        'Failed to load resource: the server responded with a status of 404 (Not Found)' &&
      error.url === `${origin}/favicon.ico`,
  );
  assert.equal(errors.length, serverErrors.length + faviconErrors.length);
  assert.equal(serverErrors.length, responses.length);
  for (const error of errors) {
    assert.equal(error.phase, label);
    assert.equal(error.kind, 'console');
  }
  for (const error of serverErrors) {
    assert.equal(error.url, `${origin}/preview/docs/outer/inner/guide`);
  }
  for (const [relativeIndex, response] of responses.entries()) {
    assert.equal(response.phase, label);
    assert.equal(response.url, `${origin}/preview/docs/outer/inner/guide`);
    assert.equal(response.status, 500);
    expectedFailedResponseIndexes.add(responseOffset + relativeIndex);
  }
  for (let index = errorOffset; index < browserErrors.length; index += 1) {
    expectedBrowserErrorIndexes.add(index);
  }
  summary.intentionalBrowserFailures ??= [];
  summary.intentionalBrowserFailures.push({ label, errors, responses });
}

async function runDevBrowser() {
  const port = await reservePort();
  dev = spawnLogged('dev', [
    'run',
    'bfixture:serve:development',
    '--host',
    '127.0.0.1',
    '--port',
    String(port),
  ]);
  const origin = `http://127.0.0.1:${port}`;
  summary.devOrigin = origin;
  const readiness = new AbortController();
  try {
    await Promise.race([
      waitHttp(`${origin}/preview/docs/outer/inner/guide`, 180_000, readiness.signal, () =>
        /Application bundle generation failed/.test(dev.text())
          ? `Angular dev build failed before readiness:\n${dev.text().slice(-4000)}`
          : undefined,
      ),
      dev.closed.then((result) => {
        throw new Error(
          `dev exited before HTTP readiness (${result.code}/${result.signal}):\n${result.text.slice(-4000)}`,
        );
      }),
    ]);
  } finally {
    readiness.abort(new Error('Dev readiness observation completed.'));
  }
  const playwright = await import(
    process.env.PLAYWRIGHT_MODULE ||
      '/Users/alex/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'
  );
  browser = await playwright.chromium.launch({
    headless: true,
    executablePath:
      process.env.CHROME_EXECUTABLE ||
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  let browserPhase = 'dev-healthy';
  page.setDefaultTimeout(60_000);
  page.on('pageerror', (error) =>
    browserErrors.push({
      kind: 'pageerror',
      phase: browserPhase,
      message: String(error),
      url: page.url(),
      at: new Date().toISOString(),
    }),
  );
  page.on('console', (message) => {
    if (message.type() === 'error')
      browserErrors.push({
        kind: 'console',
        phase: browserPhase,
        message: message.text(),
        url: message.location().url || page.url(),
        at: new Date().toISOString(),
      });
  });
  page.on('response', (response) => {
    if (response.status() >= 400)
      failedResponses.push({
        phase: browserPhase,
        url: response.url(),
        status: response.status(),
        at: new Date().toISOString(),
      });
  });
  await page.goto(`${origin}/preview/docs/outer/inner/guide`, { waitUntil: 'domcontentloaded' });
  await page.locator('#shared-marker').waitFor();
  await page.getByText('Feature `guide` ${value}', { exact: true }).first().waitFor();
  assert.equal(await page.locator('body').getAttribute('data-bootstrap-error'), null);
  const innerScope = page.locator('ng-doc-demo [data-testid="scope"]');
  await innerScope.filter({ hasText: 'inner-provider' }).waitFor();
  assert.equal(await innerScope.innerText(), 'inner-provider');
  await page
    .locator('ng-doc-demo [data-testid="legacy-demo"]')
    .filter({ hasText: 'legacy-demo inner-provider' })
    .waitFor();
  summary.checks.f14StandaloneFalseNgModuleDemo = true;
  const demo = page.locator('ng-doc-demo [data-testid="counter"]');
  await page.getByText('Demo 2', { exact: true }).waitFor();
  assert.equal((await demo.innerText()).trim(), 'Demo 2');
  await demo.click();
  await page.getByText('Demo 3', { exact: true }).waitFor();
  assert.equal(
    await demo.evaluate((node) => getComputedStyle(node).backgroundColor),
    'rgb(17, 91, 177)',
  );
  summary.checks.f01GuideAndTabs = true;
  summary.checks.f02NestedCategoryProvider = true;
  summary.checks.f05ExternalDemoResources = true;

  const playground = page.locator('ng-doc-playground [data-testid="counter"]');
  await playground.waitFor();
  assert.match((await playground.innerText()).trim(), /Initial "quoted" \\ path ☃ 4/);
  assert.equal(
    await page.locator('ng-doc-playground [data-testid="required"]').innerText(),
    'required-start',
  );
  const stringInput = page.locator('ng-doc-playground input[ngdocinputstring]').first();
  await stringInput.fill('Edited ☃');
  await page.locator('ng-doc-playground input[type="number"]').first().fill('9');
  await page.getByText('Edited ☃ 9', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await page.getByText('Reset label 2', { exact: true }).waitFor();
  assert.equal(
    await page.locator('ng-doc-playground [data-testid="required"]').innerText(),
    'required-reset',
  );
  summary.checks.f06PlaygroundAliasesAndReset = true;
  summary.checks.f14ManualRequiredModel = true;
  const mermaid = page.locator('ng-doc-mermaid-viewer svg');
  await mermaid.getByText('Visible Mermaid Label', { exact: false }).waitFor();
  summary.checks.f16MermaidRenderedLabel = true;

  await page.getByRole('link', { name: 'Details', exact: true }).click();
  await page.locator('#details-marker').waitFor();
  assert.match(page.url(), /\/preview\/docs\/outer\/inner\/guide\/details$/);
  await page.goto(`${origin}/preview/docs/outer/inner/guide`, {
    waitUntil: 'domcontentloaded',
  });
  await page.locator('#shared-marker').waitFor();
  const queryHref = await page
    .getByRole('link', { name: 'Query', exact: true })
    .getAttribute('href');
  assert(queryHref);
  const queryUrl = new URL(queryHref, origin);
  assert.equal(queryUrl.pathname, '/preview/docs/outer/inner/guide');
  assert.equal(queryUrl.search, '?mode=test');
  assert.equal(decodeURIComponent(queryUrl.hash), '#unicode-привет');
  assert.equal(
    await page.getByRole('link', { name: 'Mail', exact: true }).getAttribute('href'),
    'mailto:docs@example.com',
  );
  const localAnchor = page.getByRole('link', { name: 'Local anchor', exact: true });
  const localAnchorUrl = new URL((await localAnchor.getAttribute('href')) ?? '', origin);
  assert.equal(localAnchorUrl.pathname, '/preview/docs/outer/inner/guide');
  assert.equal(decodeURIComponent(localAnchorUrl.hash), '#unicode-привет');
  await localAnchor.click();
  await page.waitForURL(/#unicode-%D0%BF%D1%80%D0%B8%D0%B2%D0%B5%D1%82$/);
  const sameOrigin = page.getByRole('link', { name: 'Same origin', exact: true });
  assert.equal(await sameOrigin.getAttribute('href'), '/preview/docs/outer/outer-page');
  await sameOrigin.click();
  await page.getByText('Outer provider page', { exact: true }).first().waitFor();
  await page.goto(`${origin}/preview/docs/outer/inner/guide`, {
    waitUntil: 'domcontentloaded',
  });
  await page.locator('#shared-marker').waitFor();
  summary.checks.f16AnchorAndSameOriginNavigation = true;
  summary.checks.f16BaseHrefLinksAndUnicode = true;

  const indexes = await readIndexes(origin);
  const indexText = JSON.stringify(indexes);
  assert.match(indexText, /Feature `guide` \$\{value\}/);
  assert.match(indexText, /Overview ☃/);
  assert.match(indexText, /Widget API summary/);
  summary.checks.f03KeywordsAnchorsSearch = true;

  const keywords = await readKeywords(origin);
  const widget = keywords.WidgetApi;
  assert(widget, 'WidgetApi keyword missing');
  const apiUrl = new URL(widget.path, `${origin}/preview/`).href;
  await page.goto(apiUrl);
  await page.getByText('Widget API summary.', { exact: false }).first().waitFor();
  await page.getByText('Multiline remarks', { exact: false }).first().waitFor();
  await page.getByText('Inherited label', { exact: false }).first().waitFor();
  summary.apiUrl = apiUrl;
  summary.checks.f04ApiDeclarations = true;
  summary.checks.f15RichApiPresentation = true;

  const apiSourcePath = path.join(workspace, 'src/api.ts');
  const originalApiSource = await readFile(apiSourcePath, 'utf8');
  const beforeApiReload = await page.evaluate(() => performance.timeOrigin);
  let logOffset = dev.text().length;
  await writeFile(
    apiSourcePath,
    `${originalApiSource}\n/** Added while the supported Angular host is running. */\nexport class AddedApi { value = 'added'; }\n`,
  );
  const addedKeywords = await waitUntil(
    async () => {
      const current = await readKeywords(origin);
      return current.AddedApi ? current : undefined;
    },
    120_000,
    'AddedApi keyword publication',
  );
  await waitForLogSince(
    dev,
    logOffset,
    /Page reload sent to client/,
    'AddedApi native Angular rebuild',
  );
  await page.waitForFunction(
    (before) => performance.timeOrigin > before && document.body.dataset['bootstrapped'] === 'true',
    beforeApiReload,
  );
  const addedUrl = new URL(addedKeywords.AddedApi.path, `${origin}/preview/`).href;
  await page.goto(addedUrl, { waitUntil: 'domcontentloaded' });
  await page
    .getByText('Added while the supported Angular host is running.', { exact: false })
    .first()
    .waitFor();
  const addedModule = path.join(generatedRoot, 'api/reference/classes/public/AddedApi/page.ts');
  assert.equal(await fileExists(addedModule), true);
  summary.checks.f04ApiCreateBrowserConsumption = true;
  await page.goto(`${origin}/preview/docs/outer/inner/guide`, {
    waitUntil: 'domcontentloaded',
  });
  await page.getByText('Demo 2', { exact: true }).waitFor();
  await page.waitForFunction(() => document.body.dataset['bootstrapped'] === 'true');
  const beforeApiDeleteReload = await page.evaluate(() => performance.timeOrigin);
  browserPhase = 'api-delete';
  logOffset = dev.text().length;
  await writeFile(apiSourcePath, originalApiSource);
  await waitUntil(
    async () => ((await readKeywords(origin)).AddedApi ? undefined : true),
    120_000,
    'AddedApi keyword deletion',
  );
  await waitUntil(
    async () => (!(await fileExists(addedModule)) ? true : undefined),
    120_000,
    'AddedApi module deletion',
  );
  await waitForLogSince(
    dev,
    logOffset,
    /Page reload sent to client/,
    'AddedApi deletion native Angular rebuild',
  );
  await page.waitForFunction(
    (before) => performance.timeOrigin > before && document.body.dataset['bootstrapped'] === 'true',
    beforeApiDeleteReload,
  );
  const apiListResponse = await fetch(`${origin}/preview/assets/ng-doc/reference/api-list.json`, {
    signal: AbortSignal.timeout(10_000),
  });
  assert.equal(apiListResponse.status, 200);
  const apiList = await apiListResponse.json();
  const apiListNames = apiList.flatMap((scope) => scope.items.map((item) => item.name));
  assert(apiListNames.includes('WidgetApi'));
  assert(!apiListNames.includes('AddedApi'));
  await page.goto(`${origin}/preview/docs/outer/inner/reference`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForFunction(() => document.body.dataset['bootstrapped'] === 'true');
  summary.apiListAfterDelete = {
    url: page.url(),
    text: (await page.locator('body').innerText()).slice(0, 4_000),
  };
  await writeFile(path.join(evidence, 'api-list-after-delete.html'), await page.content());
  const apiListItem = (name) =>
    page
      .locator('ng-doc-api-list .ng-doc-api-list-index li')
      .filter({ has: page.locator('.ng-doc-api-list-name', { hasText: name }) });
  const widgetListItem = apiListItem(/^WidgetApi$/);
  await widgetListItem.waitFor();
  assert.equal(
    await widgetListItem.locator('a').getAttribute('href'),
    '/preview/docs/reference/classes/public/WidgetApi',
  );
  assert.equal(
    await apiListItem(/^AddedApi$/).count(),
    0,
    'The freshly bootstrapped API list retained the deleted declaration.',
  );
  assert.equal(await page.locator('body').getAttribute('data-bootstrap-error'), null);
  browserPhase = 'dev-healthy';
  summary.checks.f04ApiDeleteRemovesModule = true;

  await page.goto(`${origin}/preview/docs/outer/outer-page`);
  await page
    .locator('ng-doc-demo [data-testid="scope"]')
    .filter({ hasText: 'outer-provider' })
    .waitFor();
  assert.equal(
    await page.locator('ng-doc-demo [data-testid="scope"]').innerText(),
    'outer-provider',
  );
  summary.checks.f14NestedProviderOverride = true;

  await page.goto(`${origin}/preview/docs/outer/inner/guide`, {
    waitUntil: 'domcontentloaded',
  });
  await page.getByText('Demo 2', { exact: true }).waitFor();

  const unopenedDescriptionPath = path.join(workspace, 'docs/outer/inner/unopened/ng-doc.page.ts');
  const originalUnopenedDescription = await readFile(unopenedDescriptionPath, 'utf8');
  browserPhase = 'duplicate-route';
  logOffset = dev.text().length;
  await writeFile(
    unopenedDescriptionPath,
    originalUnopenedDescription.replace("route: 'unopened'", "route: 'guide'"),
  );
  await waitForLogSince(
    dev,
    logOffset,
    /OUTPUT_ROUTE_PATH_COLLISION/,
    'duplicate route diagnostic',
  );
  assert.equal(
    (
      await fetch(`${origin}/preview/docs/outer/inner/guide`, {
        signal: AbortSignal.timeout(10_000),
      })
    ).status,
    200,
  );
  logOffset = dev.text().length;
  await writeFile(unopenedDescriptionPath, originalUnopenedDescription);
  await waitForLogSince(dev, logOffset, /Page reload sent to client/, 'duplicate route recovery');
  await page.goto(`${origin}/preview/docs/outer/inner/guide`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForFunction(() => document.body.dataset['bootstrapped'] === 'true');
  await page.getByText('Demo 2', { exact: true }).waitFor();
  browserPhase = 'dev-healthy';
  summary.checks.f01DuplicateRouteFailurePreservedHost = true;

  const featureHtmlPath = path.join(workspace, 'src/feature.html');
  const originalFeatureHtml = await readFile(featureHtmlPath, 'utf8');
  const templateErrorOffset = browserErrors.length;
  const templateResponseOffset = failedResponses.length;
  browserPhase = 'template-error';
  logOffset = dev.text().length;
  await writeFile(featureHtmlPath, '<article>{{ doesNotExistOnFeature }}</article>\n');
  await waitForLogSince(
    dev,
    logOffset,
    /Application bundle generation failed[\s\S]*TS2339:[^\n]*doesNotExistOnFeature[\s\S]*\[plugin angular-compiler\]/,
    'native Angular template diagnostic',
  );
  logOffset = dev.text().length;
  await writeFile(featureHtmlPath, originalFeatureHtml);
  await waitForLogSince(
    dev,
    logOffset,
    /Application bundle generation complete/,
    'native Angular template recovery',
  );
  // Angular's SSR middleware can serve a half-evaluated main.server.mjs to a request that races the
  // post-rebuild re-evaluation (evidence/t19/b-ssr-cache-500); navigate only after the reload is sent.
  await waitForLogSince(
    dev,
    logOffset,
    /Page reload sent to client/,
    'native Angular template recovery reload',
  );
  await page.goto(`${origin}/preview/docs/outer/inner/guide`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForFunction(() => document.body.dataset['bootstrapped'] === 'true');
  await page.getByText('Demo 2', { exact: true }).waitFor();
  assert.equal(await page.locator('body').getAttribute('data-bootstrap-error'), null);
  await page.locator('ng-doc-demo [data-testid="counter"]').click();
  await page.getByText('Demo 3', { exact: true }).waitFor();
  acceptIntentionalBrowserFailures(
    'template-error',
    templateErrorOffset,
    templateResponseOffset,
    origin,
  );
  browserPhase = 'dev-healthy';
  summary.checks.f10NativeTemplateFailureRecovery = true;

  const featureSourcePath = path.join(workspace, 'src/feature.ts');
  const originalFeatureSource = await readFile(featureSourcePath, 'utf8');

  await writeFile(
    path.join(workspace, 'docs/shared.md.nunj'),
    '<p id="shared-marker">Shared include version two</p>\n',
  );
  await page.getByText('Shared include version two', { exact: true }).waitFor({ timeout: 120_000 });
  await writeFile(
    featureHtmlPath,
    `<article data-testid="feature"><button data-testid="counter" (click)="increment()">UPDATED {{ label() }} {{ amount() }}</button><span data-testid="required">{{ requiredValue() }}</span><span data-testid="scope">{{ scope }}</span></article>\n`,
  );
  await writeFile(
    path.join(workspace, 'src/feature.scss'),
    "[data-testid='counter'] { background-color: rgb(144, 33, 99); color: white; }\n",
  );
  await writeFile(featureSourcePath, originalFeatureSource.replace('value + 1', 'value + 2'));
  await page.getByText(/UPDATED Demo 2/).waitFor({ timeout: 120_000 });
  const updatedDemo = page.locator('ng-doc-demo [data-testid="counter"]');
  await waitUntil(
    async () =>
      (await updatedDemo.evaluate((node) => getComputedStyle(node).backgroundColor)) ===
      'rgb(144, 33, 99)',
    120_000,
    'updated SCSS runtime style',
  );
  const displayedCode = page
    .locator('ng-doc-demo ng-doc-code')
    .filter({ hasText: 'value + 2' })
    .first();
  await displayedCode.waitFor({ timeout: 120_000 });
  const displayedTypeScript = await displayedCode.innerText();
  assert.match(displayedTypeScript, /value \+ 2/);
  await page.locator('ng-doc-demo [data-testid="counter"]').click();
  await page.getByText('UPDATED Demo 4', { exact: true }).waitFor();
  summary.checks.f02SharedIncludeWatch = true;
  summary.checks.f05HtmlScssWatch = true;
  summary.checks.f05TsRuntimeAndDisplayedSourceWatch = true;

  await page.screenshot({ path: path.join(evidence, 'dev-feature.png'), fullPage: true });
  await writeFile(path.join(evidence, 'dev.log'), dev.text());
  assert.deepEqual(
    browserErrors.filter((_, index) => !expectedBrowserErrorIndexes.has(index)),
    [],
  );
  assert.deepEqual(
    failedResponses.filter((_, index) => !expectedFailedResponseIndexes.has(index)),
    [],
  );
  summary.checks.noBrowserErrors = true;
  await browser.close();
  browser = undefined;
  await stopProcess(dev, 'dev');
  dev = undefined;
  const probe = createServer();
  await new Promise((resolve, reject) =>
    probe.once('error', reject).listen(port, '127.0.0.1', resolve),
  );
  await new Promise((resolve, reject) =>
    probe.close((error) => (error ? reject(error) : resolve())),
  );
  summary.checks.devPortReleased = true;
}

async function runProductionSsr() {
  const manifest = path.join(generatedRoot, '.ng-doc-output-manifest.json');
  const lastGoodManifest = await readFile(manifest);
  const lastGoodMtime = (await stat(manifest)).mtimeMs;
  await rm(path.join(workspace, unopenedMarkdown));
  const failure = await runExpectedFailure(
    'production-missing-template',
    ['run', 'bfixture:build:production'],
    90_000,
  );
  assert.match(failure.text, /not found|missing|DISCOVERY|CONTENT/i);
  assert.deepEqual(await readFile(manifest), lastGoodManifest);
  assert.equal((await stat(manifest)).mtimeMs, lastGoodMtime);
  await put(unopenedMarkdown, unopenedContent);
  await runCommand('production-repair-build', ['run', 'bfixture:build:production'], 240_000);
  summary.checks.productionMissingTemplateFailed = true;
  summary.checks.productionFailurePreservedManifest = true;
  summary.checks.productionRepairSucceeded = true;
  assert((await stat(path.join(outputRoot, 'server/server.mjs'))).isFile());
  const port = await reservePort();
  ssr = spawn(process.execPath, [path.join(outputRoot, 'server/server.mjs')], {
    cwd: os.tmpdir(),
    env: { ...process.env, PORT: String(port), NG_ALLOWED_HOSTS: '127.0.0.1,localhost' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let ssrLog = '';
  ssr.stdout.on('data', (value) => (ssrLog += String(value)));
  ssr.stderr.on('data', (value) => (ssrLog += String(value)));
  const origin = `http://127.0.0.1:${port}`;
  const route = '/preview/docs/outer/inner/guide';
  const response = await waitHttp(`${origin}${route}`, 60_000);
  const html = await response.text();
  assert.match(html, /Feature Guide/);
  assert.match(html, /inner-provider/);
  assert.match(html, /ngh=/);
  assert.match(html, /<base href="\/preview\/">/);
  const documentTree = parse(html);
  const sidebar = findElement(documentTree, (node) => node.tagName === 'ng-doc-sidebar');
  assert(sidebar, 'SSR output is missing the real NgDoc sidebar.');
  const collapsedCategory = findElement(
    sidebar,
    (node) =>
      node.tagName === 'ng-doc-sidebar-category' &&
      elementText(node).includes('Collapsed category'),
  );
  assert(collapsedCategory, 'SSR output is missing the collapsed category subtree.');
  const collapsedLink = findElement(
    collapsedCategory,
    (node) => node.tagName === 'a' && attribute(node, 'href') === '/preview/docs/collapsed/page',
  );
  assert(collapsedLink, 'SSR collapsed category does not retain its child route link.');
  summary.checks.f16CollapsedCategorySsrLink = true;
  await writeFile(path.join(evidence, 'ssr.html'), html);
  const asset = await fetch(`${origin}/preview/assets/ng-doc/indexes.json`);
  assert.equal(asset.status, 200);
  const indexRecords = await asset.json();
  assert(Array.isArray(indexRecords), 'Search index asset is not a JSON record array.');
  assert(
    indexRecords.some(
      (record) =>
        record?.route === 'docs/outer/inner/guide' &&
        record?.section === 'Unicode Привет' &&
        typeof record?.content === 'string' &&
        record.content.includes('Visible Mermaid Label'),
    ),
    'Search index asset does not contain the generated guide Mermaid record.',
  );
  const playwright = await import(
    process.env.PLAYWRIGHT_MODULE ||
      '/Users/alex/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'
  );
  browser = await playwright.chromium.launch({
    headless: true,
    executablePath:
      process.env.CHROME_EXECUTABLE ||
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  });
  const page = await browser.newPage();
  page.on('pageerror', (error) =>
    browserErrors.push({
      kind: 'pageerror',
      phase: 'production',
      message: String(error),
      url: page.url(),
      at: new Date().toISOString(),
    }),
  );
  page.on('console', (message) => {
    if (message.type() === 'error')
      browserErrors.push({
        kind: 'console',
        phase: 'production',
        message: message.text(),
        url: message.location().url || page.url(),
        at: new Date().toISOString(),
      });
  });
  page.on('response', (response) => {
    if (response.status() >= 400)
      failedResponses.push({
        phase: 'production',
        url: response.url(),
        status: response.status(),
        at: new Date().toISOString(),
      });
  });
  await page.goto(`${origin}${route}`);
  const demo = page.locator('ng-doc-demo [data-testid="counter"]');
  await demo.waitFor();
  await demo.click();
  await page.getByText(/UPDATED Demo 4/).waitFor();
  summary.checks.f12DirectSsrHydration = true;
  summary.checks.f16SsrBaseAndAssets = true;
  await page.screenshot({ path: path.join(evidence, 'ssr-hydrated.png'), fullPage: true });
  await browser.close();
  browser = undefined;
  ssr.kill('SIGTERM');
  await once(ssr, 'close');
  await writeFile(path.join(evidence, 'ssr-server.log'), ssrLog);
  ssr = undefined;
}

try {
  mark('fixture:start');
  await createFixture();
  assert.equal(summary.dottedAncestor.startsWith('.'), true);
  assert.equal(
    path
      .relative(workspace, generatedRoot)
      .split(path.sep)
      .some((segment) => segment.startsWith('.')),
    false,
  );
  mark('fixture:ready', { package: summary.package });
  if (process.env.NGDOC_FIXTURE_ONLY === '1') {
    summary.fixtureOnly = true;
  } else {
    await runDevBrowser();
    await runProductionSsr();
    assert.deepEqual(
      browserErrors.filter((_, index) => !expectedBrowserErrorIndexes.has(index)),
      [],
    );
    assert.deepEqual(
      failedResponses.filter((_, index) => !expectedFailedResponseIndexes.has(index)),
      [],
    );
    summary.passed = Object.values(summary.checks).every(Boolean);
    assert.equal(summary.passed, true);
  }
} catch (error) {
  summary.failure = error?.stack || String(error);
  process.exitCode = 1;
  console.error(summary.failure);
} finally {
  if (browser) await browser.close();
  if (dev) {
    await writeFile(path.join(evidence, 'dev.log'), dev.text());
    await stopProcess(dev, 'dev');
  }
  if (ssr && ssr.exitCode === null) {
    ssr.kill('SIGTERM');
    await once(ssr, 'close');
  }
  summary.events = events;
  summary.browserErrors = browserErrors;
  summary.failedResponses = failedResponses;
  summary.sourceDigest = sourceDigestAtStartup;
  summary.finished = new Date().toISOString();
  await writeFile(path.join(evidence, 'results.json'), `${JSON.stringify(summary, null, 2)}\n`);
  if (process.env.KEEP_NGDOC_ANGULAR_B_FIXTURE !== '1') {
    await rm(runtimeParent, { recursive: true, force: true });
  }
}
