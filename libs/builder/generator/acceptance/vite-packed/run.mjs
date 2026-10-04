import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { prepare } from '../../../../../plugins/semantic-release/update-dependencies.js';

const execute = promisify(execFile);
const harness = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(harness, '../../../../..');
const evidence = path.resolve(
  process.env.NGDOC_PACKED_EVIDENCE || path.join(repository, 'tmp/acceptance/vite-packed'),
);
const dist = path.join(repository, 'dist/libs');
const runtime = await mkdtemp(path.join(os.tmpdir(), 'ng-doc-vite-packed-'));
const snapshot = path.join(runtime, 'packages');
const consumer = path.join(runtime, 'consumer');
const summary = { status: 'running', node: process.version, runtime, checks: [], errors: [] };

await mkdir(evidence, { recursive: true });

async function run(command, args, cwd, name) {
  try {
    const result = await execute(command, args, {
      cwd,
      env: { ...process.env, CI: '1', NX_DAEMON: 'false', NX_NO_CLOUD: 'true', NX_TUI: 'false' },
      maxBuffer: 30 * 1024 * 1024,
      timeout: 180_000,
    });
    await writeFile(
      path.join(evidence, `${name}.log`),
      `$ ${command} ${args.join(' ')}\n${result.stdout}\n${result.stderr}`,
    );
    return result;
  } catch (error) {
    const output = `$ ${command} ${args.join(' ')}\nexit=${error.code}\n${error.stdout ?? ''}\n${error.stderr ?? error.message}`;
    await writeFile(path.join(evidence, `${name}.log`), output);
    throw new Error(`${name} failed: ${error.stderr ?? error.message}`);
  }
}

async function digest(file) {
  return createHash('sha256')
    .update(await readFile(file))
    .digest('hex');
}

async function put(relative, content) {
  const target = path.join(consumer, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content);
  return target;
}

try {
  const packageNames = ['builder', 'core', 'utils', 'app', 'ui-kit'];
  for (const name of packageNames) {
    await cp(path.join(dist, name), path.join(snapshot, name), { recursive: true });
  }
  const packageDirs = packageNames.map((name) => path.join(snapshot, name));
  const manifestsBefore = Object.fromEntries(
    await Promise.all(
      packageNames.map(async (name) => [
        name,
        JSON.parse(await readFile(path.join(snapshot, name, 'package.json'), 'utf8')),
      ]),
    ),
  );
  const versions = [...new Set(Object.values(manifestsBefore).map((manifest) => manifest.version))];
  assert.deepEqual(versions, ['0.0.1'], 'Packed snapshot versions must agree before prepare.');
  prepare({ packages: packageDirs }, { logger: { log: () => undefined } });
  const manifestsAfter = Object.fromEntries(
    await Promise.all(
      packageNames.map(async (name) => [
        name,
        JSON.parse(await readFile(path.join(snapshot, name, 'package.json'), 'utf8')),
      ]),
    ),
  );
  summary.prepare = {
    versions,
    changes: packageNames.flatMap((name) =>
      Object.keys(manifestsAfter[name].dependencies ?? {})
        .filter(
          (dependency) =>
            manifestsBefore[name].dependencies?.[dependency] !==
            manifestsAfter[name].dependencies?.[dependency],
        )
        .map((dependency) => ({
          package: manifestsAfter[name].name,
          field: `dependencies.${dependency}`,
          before: manifestsBefore[name].dependencies[dependency],
          after: manifestsAfter[name].dependencies[dependency],
        })),
    ),
  };
  const provenance = JSON.parse(
    await readFile(path.join(snapshot, 'builder/generator/build-provenance.json'), 'utf8'),
  );
  summary.provenance = {
    sourceDigest: provenance.sourceDigest,
    compilerVersion: provenance.compilerVersion,
    toolchainDigest: provenance.toolchainDigest,
    snapshot: 'private runtime copy',
  };

  const tarballs = {};
  for (const name of packageNames) {
    const result = await run('npm', ['pack', '--json'], path.join(snapshot, name), `pack-${name}`);
    const [{ filename }] = JSON.parse(result.stdout);
    const tarball = path.join(snapshot, name, filename);
    tarballs[name] = tarball;
    summary.packages ??= {};
    summary.packages[name] = { filename, sha256: await digest(tarball) };
    await writeFile(
      path.join(evidence, `pack-${name}.log`),
      `$ npm pack --json\n${JSON.stringify(summary.packages[name])}\n`,
    );
  }

  await put(
    'package.json',
    JSON.stringify(
      {
        name: 'ng-doc-packed-vite-consumer',
        private: true,
        type: 'module',
        dependencies: Object.fromEntries(
          Object.entries(tarballs).map(([name, file]) => [`@ng-doc/${name}`, `file:${file}`]),
        ),
        devDependencies: {
          '@analogjs/vite-plugin-angular': '^2.8.0',
          '@angular/common': '22.2.1',
          '@angular/cdk': '22.0.6',
          '@angular/compiler': '22.2.1',
          '@angular/compiler-cli': '22.2.1',
          '@angular/core': '22.2.1',
          '@angular/build': '22.2.1',
          '@angular/platform-browser': '22.2.1',
          '@angular/platform-server': '22.2.1',
          '@angular/router': '22.2.1',
          '@angular/forms': '22.2.1',
          typescript: '6.0.3',
          // The Vite engine's range, as `ng add` and `migrate-to-vite` add it.
          vite: '^8.3.0',
          vitest: '4.1.11',
          'zone.js': '0.15.1',
        },
      },
      null,
      2,
    ),
  );
  await run('npm', ['install', '--no-audit', '--no-fund'], consumer, 'npm-install');
  summary.checks.push('fresh npm consumer installed all five actual ng-doc package tarballs');
  const installedLock = JSON.parse(
    await readFile(path.join(consumer, 'package-lock.json'), 'utf8'),
  );
  const rootVite = installedLock.packages['node_modules/vite']?.version ?? '';
  assert.match(rootVite, /^8\.(?:[3-9]|\d{2,})\.\d+$/, `the root Vite is ${rootVite}`);
  summary.checks.push(`the root Vite ${rootVite} is inside the engine's ^8.3.0 next to Vitest`);

  await put(
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
            '@ng-doc/generated': ['./generated/index.ts'],
            '@ng-doc/generated/*': ['./generated/*'],
          },
        },
        angularCompilerOptions: { strictTemplates: true },
        include: ['src/**/*.ts', 'docs/**/*.ts', 'generated/**/*.ts', 'server.ts'],
      },
      null,
      2,
    ),
  );
  await put(
    'index.html',
    '<!doctype html><html><body><app-root></app-root><script type="module" src="/src/main.ts"></script></body></html>',
  );
  await put(
    'src/app.ts',
    "import { Component } from '@angular/core'; import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http'; import { RouterOutlet } from '@angular/router'; import { NgDocRootComponent, NgDocSidebarComponent, provideNgDocApp, providePageSkeleton, provideMainPageProcessor, NG_DOC_DEFAULT_PAGE_PROCESSORS } from '@ng-doc/app'; import { provideNgDocContext } from '@ng-doc/generated'; @Component({selector:'app-root', standalone:true, imports:[RouterOutlet, NgDocRootComponent, NgDocSidebarComponent], template:'<ng-doc-root [sidebar]=\"true\"><ng-doc-sidebar></ng-doc-sidebar><router-outlet></router-outlet></ng-doc-root>'}) export class App {} export const appProviders = [provideHttpClient(withInterceptorsFromDi()), ...provideNgDocApp(), ...providePageSkeleton({}), ...provideMainPageProcessor(NG_DOC_DEFAULT_PAGE_PROCESSORS), ...provideNgDocContext()];\n",
  );
  await put(
    'src/main.ts',
    "import 'zone.js'; import { bootstrapApplication } from '@angular/platform-browser'; import { provideRouter } from '@angular/router'; import { NG_DOC_ROUTING } from '@ng-doc/generated'; import { App, appProviders } from './app'; bootstrapApplication(App, { providers: [...appProviders, provideRouter([{ path: 'docs', children: NG_DOC_ROUTING }, { path: '', pathMatch: 'full', redirectTo: 'docs' }])] });\n",
  );
  await put(
    'src/main.server.ts',
    "import 'zone.js/node'; import { enableProdMode } from '@angular/core'; import { bootstrapApplication, BootstrapContext } from '@angular/platform-browser'; import { provideRouter, withEnabledBlockingInitialNavigation } from '@angular/router'; import { provideServerRendering } from '@angular/platform-server'; import { NG_DOC_ROUTING } from '@ng-doc/generated'; import { App, appProviders } from './app'; enableProdMode(); export default (context: BootstrapContext) => bootstrapApplication(App, { providers: [...appProviders, provideRouter([{ path: 'docs', children: NG_DOC_ROUTING }], withEnabledBlockingInitialNavigation()), provideServerRendering()] }, context);\n",
  );
  await put(
    'server.ts',
    "import { renderApplication } from '@angular/platform-server'; import bootstrap from './src/main.server'; export const render = (url: string) => renderApplication(bootstrap, { document: \"<!doctype html><html><head><base href='/'> </head><body><app-root></app-root></body></html>\", url, allowedHosts: ['localhost'] });\n",
  );
  await put(
    'docs/ng-doc.page.ts',
    "const PackedGuide = { title: 'Packed guide', route: 'packed', mdFile: './packed.md' }; export default PackedGuide;\n",
  );
  await put('docs/packed.md', '# Packed guide\n\nGenerated through a public packed Vite entry.\n');
  await put(
    'ng-doc.config.mjs',
    "export default { docsPath: 'docs', tsConfig: 'tsconfig.json', routePrefix: 'docs', cache: false };\n",
  );
  await put(
    'vite.config.mjs',
    `import { createNgDocAngularPlugins as angular } from '@ng-doc/builder/generator/vite/angular/index.js';
import { createNgDocVitePlugin } from '@ng-doc/builder/generator/vite/index.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('.', import.meta.url));
const ngDocPlugins = createNgDocVitePlugin({ analogLiveReload: true, angularPlugins: angular({ liveReload: true, tsconfig: path.join(root, 'tsconfig.json'), workspaceRoot: root, disableTypeChecking: false, jit: false }), angularComponentProbe: path.join(root, 'src/app.ts'), generator: { projectId: 'packed', workspaceRoot: root, configFile: path.join(root, 'ng-doc.config.mjs'), defaults: { docsRoot: path.join(root, 'docs'), tsConfig: path.join(root, 'tsconfig.json'), outputRoot: path.join(root, 'generated'), cacheRoot: path.join(root, 'cache') } } });
export default {
  plugins: [ngDocPlugins],
  build: { outDir: 'browser', sourcemap: true },
  ssr: { noExternal: true, optimizeDeps: { include: ['@ng-doc/core'] } }
};
`,
  );
  await put(
    'public-api.ts',
    "import type { Plugin, UserConfig } from 'vite'; import { createNgDocAngularPlugins as angular } from '@ng-doc/builder/generator/vite/angular/index.js'; import path from 'node:path'; import { createNgDocVitePlugin } from '@ng-doc/builder/generator/vite/index.js'; const plugins: Plugin[] = createNgDocVitePlugin({ analogLiveReload: true, angularPlugins: angular({ liveReload: true }), angularComponentProbe: path.resolve('src/app.ts'), generator: { projectId: 'packed', workspaceRoot: '.', configFile: './ng-doc.config.mjs', defaults: { docsRoot: './docs', tsConfig: './tsconfig.json', outputRoot: './generated', cacheRoot: './cache' } } }); const nestedConfig: UserConfig = { plugins: [plugins] }; void nestedConfig;\n",
  );
  // Analog's Angular compiler-cli declarations use extensionless imports, so the real
  // Vite factory consumer uses bundler resolution. Separately retain strict NodeNext
  // validation of NgDoc's portable public entry without importing Analog's declarations.
  await put(
    'public-entry.ts',
    "import type { Plugin, UserConfig } from 'vite'; import type { NgDocVitePluginOptions } from '@ng-doc/builder/generator/vite/index.js'; import { createNgDocVitePlugin } from '@ng-doc/builder/generator/vite/index.js'; declare const options: NgDocVitePluginOptions; const plugins: Plugin[] = createNgDocVitePlugin(options); const config: UserConfig = { plugins: [plugins] }; void config;\n",
  );
  await run(
    path.join(consumer, 'node_modules/.bin/tsc'),
    [
      '--ignoreConfig',
      '--noEmit',
      '--module',
      'nodenext',
      '--moduleResolution',
      'nodenext',
      'public-entry.ts',
    ],
    consumer,
    'public-entry-typecheck',
  );
  await run(
    path.join(consumer, 'node_modules/.bin/tsc'),
    [
      '--ignoreConfig',
      '--noEmit',
      '--module',
      'esnext',
      '--moduleResolution',
      'bundler',
      'public-api.ts',
    ],
    consumer,
    'angular-composition-typecheck',
  );
  summary.checks.push(
    'public generator/vite JavaScript entry and declaration file resolve in packed consumer',
  );
  await run(path.join(consumer, 'node_modules/.bin/vite'), ['build'], consumer, 'analog-aot-build');
  const generated = await readFile(path.join(consumer, 'generated/index.ts'), 'utf8');
  const routes = await readFile(path.join(consumer, 'generated/routes.ts'), 'utf8');
  assert.ok(generated.length > 0 && routes.includes("path: 'packed'"));
  const browser = await readdir(path.join(consumer, 'browser'), { recursive: true });
  const maps = browser.filter((file) => String(file).endsWith('.map'));
  assert.ok(maps.length > 0);
  const mapsWithGeneratedSources = await Promise.all(
    maps.map(async (file) =>
      JSON.parse(await readFile(path.join(consumer, 'browser', String(file)), 'utf8')),
    ),
  );
  assert.ok(
    mapsWithGeneratedSources.some(
      (map) =>
        typeof map.mappings === 'string' &&
        map.mappings.length > 0 &&
        map.sources.some(
          (source) => source.includes('generated') || source.includes('guides/page'),
        ),
    ),
  );
  assert.ok(browser.some((file) => String(file).endsWith('.js')));
  summary.checks.push(
    'actual Analog Angular AOT build consumed NG_DOC_ROUTING with nonempty generated routing and mapped generated sources',
  );
  await run(
    path.join(consumer, 'node_modules/.bin/vite'),
    ['build', '--ssr', 'server.ts', '--outDir', 'server'],
    consumer,
    'analog-ssr-build',
  );
  const serverFiles = await readdir(path.join(consumer, 'server'), { recursive: true });
  assert.ok(serverFiles.some((file) => String(file).endsWith('.js')));
  const assetServer = createServer(async (request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
    const prefix = '/assets/ng-doc/ui-kit/';
    const asset = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : '';
    if (!asset || asset.split('/').some((part) => part === '.' || part === '..')) {
      response.writeHead(404).end();
      return;
    }
    try {
      response
        .writeHead(200, { 'content-type': 'image/svg+xml' })
        .end(await readFile(path.join(consumer, 'node_modules/@ng-doc/ui-kit/assets', asset)));
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve) => assetServer.listen(0, '127.0.0.1', resolve));
  const port = assetServer.address().port;
  let rendered;
  try {
    rendered = await run(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        `import { render } from ${JSON.stringify(pathToFileURL(path.join(consumer, 'server/server.js')).href)}; console.log(await render('http://localhost:${port}/docs/packed'));`,
      ],
      consumer,
      'ssr-render',
    );
  } finally {
    await new Promise((resolve, reject) =>
      assetServer.close((error) => (error ? reject(error) : resolve())),
    );
  }
  assert.match(rendered.stdout, /Generated through a public packed Vite entry\./);
  assert.equal(rendered.stderr, '');
  summary.checks.push(
    'packed consumer rendered /docs/packed through the built Angular server entry',
  );
  await put(
    'docs/unvisited/ng-doc.page.ts',
    "const Unvisited = { title: 'Unvisited broken guide', route: 'unvisited', mdFile: './broken.md.nunj' }; export default Unvisited;\n",
  );
  await put(
    'docs/unvisited/broken.md.nunj',
    '# Unvisited broken guide\n\n{% include "does-not-exist.nunj" %}\n',
  );
  await assert.rejects(
    () =>
      run(
        path.join(consumer, 'node_modules/.bin/vite'),
        ['build'],
        consumer,
        'unvisited-guide-negative',
      ),
    /unvisited-guide-negative failed/,
  );
  const negativeLog = await readFile(path.join(evidence, 'unvisited-guide-negative.log'), 'utf8');
  assert.match(negativeLog, /does-not-exist\.nunj/);
  summary.checks.push(
    'a never-opened guide with a missing Nunjucks include made the real packed Vite build fail with its generator diagnostic',
  );
  summary.status = 'passed';
} catch (error) {
  summary.status = 'failed';
  summary.errors.push(String(error.stack ?? error));
  process.exitCode = 1;
} finally {
  const keepRuntime = process.env.NGDOC_PACKED_KEEP_RUNTIME === '1';
  summary.cleanup = { runtime, retained: keepRuntime, removed: !keepRuntime };
  if (!keepRuntime) await rm(runtime, { recursive: true, force: true });
  await writeFile(path.join(evidence, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  console.log(
    JSON.stringify({ status: summary.status, sourceDigest: summary.provenance?.sourceDigest }),
  );
}
