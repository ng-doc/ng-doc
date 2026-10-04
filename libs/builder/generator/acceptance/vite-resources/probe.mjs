import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import angular from '@analogjs/vite-plugin-angular';
import { createServer } from 'vite';

const repository = fileURLToPath(new URL('../../../../../', import.meta.url));
const require = createRequire(import.meta.url);
const evidence = path.resolve(
  process.env.NGDOC_VITE_RESOURCES_EVIDENCE ??
    path.join(repository, 'tmp/acceptance/vite-resources-probe'),
);
const fixture = await mkdtemp(path.join(repository, 'tmp/ngdoc-vite-resources-'));
const summary = {
  status: 'running',
  fixture,
  trace: [],
  errors: [],
  runtime: {
    node: process.version,
    vite: require('vite/package.json').version,
    analog: require('@analogjs/vite-plugin-angular/package.json').version,
    angular: require('@angular/core/package.json').version,
    probeSha256: createHash('sha256')
      .update(await readFile(fileURLToPath(import.meta.url)))
      .digest('hex'),
  },
};
let server;
let releaseSass = () => undefined;
let sassReleased = false;

const hash = (value) => createHash('sha256').update(value).digest('hex');
const waitFor = async (label, predicate, timeout = 30_000) => {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for ${label}`);
};
const put = async (relative, value) => {
  const target = path.join(fixture, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, value);
  return target;
};
const stamp = (kind, details = {}) =>
  summary.trace.push({ id: summary.trace.length + 1, kind, at: Date.now(), ...details });

await mkdir(evidence, { recursive: true });
try {
  await put(
    'index.html',
    '<!doctype html><html><head><link rel="icon" href="data:,"></head><body><app-root></app-root><script type="module" src="/src/main.ts"></script></body></html>',
  );
  const appTs = await put(
    'src/app.component.ts',
    "import {Component} from '@angular/core'; @Component({selector:'app-root',standalone:true,styleUrl:'./app.component.scss',template:'<p>always-present</p>'}) export class AppComponent {}\n",
  );
  const unusedTs = await put(
    'src/unused.component.ts',
    "import {Component} from '@angular/core'; @Component({selector:'unused-probe',standalone:true,styleUrl:'./unused.component.scss',template:'<p>unimported</p>'}) export class UnusedComponent {}\n",
  );
  const unusedScss = await put(
    'src/unused.component.scss',
    "@use 'probe:theme' as probe; :host { color: probe.$color; }\n",
  );
  await put(
    'src/app.component.scss',
    "@use 'probe:theme' as probe; :host { color: probe.$color; }\n",
  );
  await put(
    'src/main.ts',
    "import 'zone.js'; import {bootstrapApplication} from '@angular/platform-browser'; import {AppComponent} from './app.component'; bootstrapApplication(AppComponent);\n",
  );
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
        },
        angularCompilerOptions: { strictTemplates: true },
        include: ['src/**/*.ts'],
      },
      null,
      2,
    ),
  );

  let importerArmed = false;
  let importerEntered = false;
  const sassGate = new Promise((resolve) => {
    releaseSass = resolve;
  });
  const importer = {
    canonicalize(url) {
      return url === 'probe:theme' ? new URL('probe:theme') : null;
    },
    async load(url) {
      if (url.protocol !== 'probe:') return null;
      stamp('sass-importer-enter', { armed: importerArmed, url: url.href });
      if (importerArmed) {
        importerEntered = true;
        await sassGate;
      }
      stamp('sass-importer-return', { armed: importerArmed, url: url.href });
      return { contents: '$color: rgb(1, 2, 3);', syntax: 'scss' };
    },
  };
  const angularPlugins = angular({
    tsconfig,
    workspaceRoot: fixture,
    disableTypeChecking: false,
    jit: false,
    liveReload: true,
  });
  for (const plugin of [angularPlugins].flat(Infinity)) {
    if (!plugin || typeof plugin !== 'object' || !String(plugin.name).includes('angular')) continue;
    for (const name of ['handleHotUpdate', 'transform']) {
      const hook = plugin[name];
      if (!hook) continue;
      const handler = typeof hook === 'function' ? hook : hook.handler;
      const wrapped = async function (...args) {
        const file = name === 'transform' ? args[1] : args[0]?.file;
        stamp(`angular-${name}-enter`, {
          file,
          sourceDigest:
            name === 'transform' && typeof args[0] === 'string' ? hash(args[0]) : undefined,
          modules: name === 'handleHotUpdate' ? args[0]?.modules?.length : undefined,
        });
        try {
          const result = await handler.apply(this, args);
          stamp(`angular-${name}-return`, {
            file,
            resultDigest:
              typeof result === 'string'
                ? hash(result)
                : result?.code
                  ? hash(result.code)
                  : undefined,
            result: result === null ? 'null' : typeof result,
          });
          return result;
        } catch (error) {
          stamp(`angular-${name}-error`, {
            file,
            message: error instanceof Error ? error.message : String(error),
          });
          throw error;
        }
      };
      plugin[name] = typeof hook === 'function' ? wrapped : { ...hook, handler: wrapped };
    }
  }
  server = await createServer({
    root: fixture,
    configFile: false,
    logLevel: 'warn',
    plugins: [angularPlugins],
    css: { preprocessorOptions: { scss: { importers: [importer] } } },
    server: { host: '127.0.0.1', port: 0, fs: { allow: [fixture] } },
  });
  await server.listen();
  const initial = await server.transformRequest('/src/main.ts');
  assert.ok(
    initial?.code.includes('AppComponent'),
    'Initial real Angular transform did not emit the application component',
  );
  stamp('initial-transform', { digest: hash(initial.code) });

  importerArmed = true;
  await writeFile(
    unusedScss,
    "@use 'probe:theme' as probe; :host { color: probe.$color; outline: 1px solid probe.$color; }\n",
  );
  await waitFor('actual Angular resource hook', () =>
    summary.trace.some(
      (item) => item.kind === 'angular-handleHotUpdate-enter' && item.file === unusedScss,
    ),
  );
  const resource = summary.trace.find(
    (item) => item.kind === 'angular-handleHotUpdate-enter' && item.file === unusedScss,
  );
  assert.equal(
    resource.modules,
    0,
    'Unimported resource did not reach the empty-modules public branch',
  );
  await waitFor('actual Sass importer entry', () => importerEntered);
  const module = server.moduleGraph.getModuleById(appTs);
  assert.ok(module, 'Application component was not present in Vite public module graph');
  server.moduleGraph.invalidateModule(module);
  const witnessStartTraceId = summary.trace.length;
  const witness = server.transformRequest('/src/app.component.ts');
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(
    summary.trace.some(
      (item) =>
        item.id > witnessStartTraceId &&
        item.kind === 'angular-transform-return' &&
        item.file?.endsWith('app.component.ts'),
    ),
    false,
    'Witness transform completed before Sass gate release',
  );
  releaseSass();
  sassReleased = true;
  const emitted = await witness;
  assert.ok(emitted?.code, 'Uncached witness emitted no Angular code');
  assert.ok(
    summary.trace.some(
      (item) =>
        item.id > witnessStartTraceId &&
        item.kind === 'angular-transform-enter' &&
        item.file?.endsWith('app.component.ts'),
    ),
  );
  assert.ok(
    summary.trace.some(
      (item) =>
        item.id > witnessStartTraceId &&
        item.kind === 'angular-transform-return' &&
        item.file?.endsWith('app.component.ts') &&
        item.resultDigest,
    ),
  );
  summary.checks = [
    'empty public resource modules',
    'actual async Sass importer gate',
    'uncached public Angular witness transform',
  ];
  summary.status = 'passed';
} catch (error) {
  summary.status = 'failed';
  summary.errors.push(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
} finally {
  if (!sassReleased) releaseSass();
  await server?.close().catch(() => undefined);
  await rm(fixture, { recursive: true, force: true });
  summary.cleanup = {
    serverClosed: server ? !server.httpServer?.listening : true,
    fixtureRemoved: !existsSync(fixture),
  };
  await writeFile(path.join(evidence, 'results.json'), JSON.stringify(summary, null, 2) + '\n');
  console.log(JSON.stringify({ status: summary.status, trace: summary.trace.length }));
}
