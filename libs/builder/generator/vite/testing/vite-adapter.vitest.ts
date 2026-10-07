import angular from '@analogjs/vite-plugin-angular';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { existsSync, statSync } from 'node:fs';
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ts } from 'ts-morph';
import {
  type FSWatcher,
  type HmrContext,
  type HotUpdateOptions,
  type Plugin,
  type ViteDevServer,
  build as viteBuild,
  createLogger,
  createServer,
} from 'vite';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

import {
  type SourceCompilerBundle,
  bundleSourceCompiler,
} from '../../compiler/testing/source-bundle';
import type { BuildResult, FileChange, OutputManifest, WatchInputs } from '../../contracts';
import { OwnedRoots } from '../../semantic/owned-roots';
import { tsconfigMembershipDependencies } from '../../semantic/program-inputs';
import { createBuildSession } from '../../session/build-session';
import { createNgDocVitePlugin } from '..';
import { qualifyAngularPlugins } from '../angular-compatibility';
import { GeneratedAssetInventory } from '../assets';
import { requirePublishedConfiguration, sameRuntimeConfiguration } from '../configuration';
import { diagnosticText, resultError } from '../diagnostics';
import { HostUpdateCoordinator } from '../host-updates';
import { acquireOutputLease } from '../lease';
import { ViteAdapterLifecycle } from '../lifecycle';
import {
  assertThemeModules,
  GENERATED_STAGE_IGNORE,
  generatedAlias,
  resolveOptions,
  staticViteConfig,
  themeImports,
} from '../options';
import { ViteFileEventSource } from '../vite-event-source';
import { WatchInputRegistry } from '../watch-inputs';

const repository = path.resolve(import.meta.dirname, '../../../../..');
const temporary: string[] = [];
const servers: ViteDevServer[] = [];

afterEach(async () => {
  await Promise.allSettled(servers.splice(0).map((server) => server.close()));
  // Vite's dependency optimizer may still write its fixture cache after the server closed.
  await Promise.all(
    temporary
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })),
  );
});

describe('createNgDocVitePlugin with a real Vite server and generator worker', () => {
  it('publishes before admission, serves manifest-owned assets, watches native edits and joins close', async () => {
    const fixture = await project();
    const publicIcon = path.join(fixture.root, 'public/assets/ng-doc/ui-kit/icons/probe.svg');
    await mkdir(path.dirname(publicIcon), { recursive: true });
    await writeFile(publicIcon, '<svg data-public-icon="true"></svg>');
    const hotUpdates: Array<{ file: string; type: string }> = [];
    const server = await start(fixture, [
      {
        name: 'generated-update-observer',
        hotUpdate(context: HotUpdateOptions) {
          hotUpdates.push({ file: context.file, type: context.type });
        },
      },
    ]);
    await server.listen();
    const address = server.httpServer?.address();
    if (!address || typeof address === 'string') throw new Error('Missing Vite address');
    const origin = `http://127.0.0.1:${address.port}`;

    expect(await readFile(path.join(fixture.output, 'index.ts'), 'utf8')).toContain(
      "export * from './routes'",
    );
    const indexes = await fetch(`${origin}/preview/assets/ng-doc/indexes.json?revision=1`);
    expect(indexes.status).toBe(200);
    expect(indexes.headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect(await indexes.text()).toContain('Initial native Vite body');
    expect(await rawStatus(origin, '/preview/assets/ng-doc/%2e%2e/secret')).toBe(404);
    expect(await rawStatus(origin, '/preview/assets/ng-doc/%2e%2e%5csecret')).toBe(404);
    expect(
      (
        await fetch(`${origin}/preview/assets/ng-doc/missing.json`, {
          headers: { accept: 'application/json' },
        })
      ).status,
    ).toBe(404);
    const icon = await fetch(`${origin}/preview/assets/ng-doc/ui-kit/icons/probe.svg`);
    expect(icon.status).toBe(200);
    expect(await icon.text()).toBe('<svg data-public-icon="true"></svg>');

    const application = path.join(fixture.root, 'src/main.ts');
    await writeFile(
      application,
      `import { NG_DOC_ROUTING } from '@ng-doc/generated';\ndocument.body.dataset.routes = String(NG_DOC_ROUTING.length + 1);\n`,
    );
    await waitFor(async () => hotUpdates.some(({ file }) => file === application));
    hotUpdates.length = 0;

    await writeFile(fixture.markdown, '# Guide\nUpdated native Vite body with searchable text.\n');
    await waitFor(async () =>
      (await readFile(path.join(fixture.output, 'assets/indexes.json'), 'utf8')).includes(
        'Updated native Vite body',
      ),
    );
    const updated = await fetch(`${origin}/preview/assets/ng-doc/indexes.json?revision=2`);
    expect(await updated.text()).toContain('Updated native Vite body');
    await waitFor(async () =>
      hotUpdates.some(
        ({ file, type }) => type === 'update' && file.startsWith(`${fixture.output}${path.sep}`),
      ),
    );

    await server.close();
    servers.splice(servers.indexOf(server), 1);
    const restarted = await start(fixture);
    expect(restarted.config.resolve.alias).toBeDefined();
  }, 60_000);

  it('starts a cold C workspace with one generation, a stable semantic scope and no reconcile', async () => {
    const fixture = await project();
    const compiler = await sourceCompiler();
    const log = path.join(await directory(), 'compiles.jsonl');
    const recording = await recordingCompiler(compiler.module, fixture, log);
    const close = async (server: ViteDevServer): Promise<void> => {
      await server.close();
      servers.splice(servers.indexOf(server), 1);
    };
    // Cold: the application imports @ng-doc/generated, which does not exist yet. The initial
    // commit creates it; generator output is not a semantic input, so the watch reuses the
    // verified buildOnce and no watch-input growth schedules a reconcile before listen.
    const coldStart = startInstant();
    const cold = await start(fixture, [], { ...compiler, module: recording, polling: true });
    const coldCompiles = await compiles(log);
    expect(coldCompiles, await staleEvidence(log, coldStart)).toEqual([
      expect.objectContaining({ generation: 1, origin: null, ownedFiles: 0, errors: 0 }),
    ]);
    expect(await manifestGeneration(fixture)).toBe(1);
    const [initial] = coldCompiles;

    // An edit regenerates with the same semantic scope and without a follow-up reconcile.
    await replaceAtomically(fixture, '# Guide\nEdited cold C body.\n');
    await waitFor(async () =>
      (await readFile(path.join(fixture.output, 'assets/indexes.json'), 'utf8')).includes(
        'Edited cold C body',
      ),
    );
    // Rewriting identical bytes is a real native event with no input change. The session discards
    // it as an unchanged save: no generation starts at all.
    // Let every generation caused by the edit (including duplicate notifications) finish first.
    await quiescent(log);
    const edited = (await compiles(log)).length;
    await replaceAtomically(fixture, '# Guide\nEdited cold C body.\n');
    await quiescent(log, 3_000);
    expect((await compiles(log)).length).toBe(edited);
    const later = (await compiles(log)).slice(1);
    // Under file-system load one write can be reported more than once; every generation it
    // yields must be a native filesystem generation, never a reconcile.
    expect(later.length).toBeGreaterThanOrEqual(1);
    for (const record of later)
      expect(record).toMatchObject({ origin: 'filesystem', digest: initial.digest, ownedFiles: 0 });
    await close(cold);

    // Warm restart: one generation again.
    await writeFile(log, '');
    const warmStart = startInstant();
    await close(await start(fixture, [], { ...compiler, module: recording, polling: true }));
    expect(await compiles(log), await staleEvidence(log, warmStart)).toEqual([
      expect.objectContaining({ generation: 1, origin: null }),
    ]);
    expect(await manifestGeneration(fixture)).toBe(1);

    // Edit the page after the warm buildOnce read it and before the watcher is ready.
    const racing = await recordingCompiler(
      compiler.module,
      fixture,
      log,
      '# Guide\nRaced native Vite body.\n',
    );
    await start(fixture, [], { ...compiler, module: racing });
    expect(await manifestGeneration(fixture)).toBeGreaterThanOrEqual(2);
    await waitFor(async () =>
      (await readFile(path.join(fixture.output, 'assets/indexes.json'), 'utf8')).includes(
        'Raced native Vite body',
      ),
    );
  }, 180_000);

  it('prints the NgDoc summary before Vite serves, then one timestamped line per edit', async () => {
    const fixture = await project();
    const lines: Array<{ text: string; timestamp: boolean }> = [];
    const logger = createLogger('info');
    logger.info = (message, options) =>
      void lines.push({ text: message, timestamp: options?.timestamp === true });
    const server = await createServer({
      root: fixture.root,
      // Its own dependency cache (below a node_modules folder, as linters and editors skip): the
      // default one is shared by every fixture.
      cacheDir: path.join(fixture.root, '.vite/node_modules/.vite'),
      configFile: false,
      base: '/preview/',
      customLogger: logger,
      plugins: [plugin(fixture)],
      resolve: { alias: packageAliases(), dedupe: angularPackages() },
      server: { host: '127.0.0.1', port: 0 },
    });
    servers.push(server);
    // Before the server serves: plain lines (this is no terminal), never timestamped.
    const startup = lines.filter(({ text }) => text.startsWith('NgDoc:'));
    expect(startup[0]).toEqual({
      text: 'NgDoc: generating documentation for vite-fixture (development)',
      timestamp: false,
    });
    const summary = startup.findIndex(({ text }) => /^NgDoc: OK generated /.test(text));
    expect(startup[summary]).toEqual({
      text: expect.stringMatching(/^NgDoc: OK generated \d+ pages? in \d+\.\ds; /),
      timestamp: false,
    });
    // Only a generation that changed nothing may follow it before Vite serves: macOS FSEvents can
    // report the fixture's files written just before the watch started, which (correctly) makes
    // the watch check them again.
    expect(startup.slice(summary + 1)).toEqual(
      startup.slice(summary + 1).map(() => ({
        text: expect.stringMatching(/^NgDoc: finished in \d+\.\ds; no changes$/),
        timestamp: false,
      })),
    );
    await server.listen();
    server.printUrls();
    // The summary stays above Vite's banner.
    const summaryAt = lines.findIndex(({ text }) => text.startsWith('NgDoc: OK generated'));
    const bannerAt = lines.findIndex(({ text }) => /➜.*Local/.test(text));
    expect(bannerAt).toBeGreaterThan(-1);
    expect(summaryAt).toBeLessThan(bannerAt);
    const before = lines.length;
    await replaceAtomically(fixture, '# Guide\nEdited body for the progress line.\n');
    await waitFor(async () =>
      lines.slice(before).some(({ text }) => /^NgDoc: updated /.test(text)),
    );
    const edit = lines.slice(before).filter(({ text }) => text.startsWith('NgDoc:'));
    // A warm-up notice may precede the edit line; every line after listen is timestamped.
    expect(edit.every(({ timestamp }) => timestamp)).toBe(true);
    expect(edit.find(({ text }) => text.startsWith('NgDoc: updated'))?.text).toMatch(
      /^NgDoc: updated \d+ (of \d+ )?pages? in \d+\.\ds \(\/[^)]*\)$/,
    );
    await server.close();
    servers.splice(servers.indexOf(server), 1);
  }, 60_000);

  it('releases its identity after an initial compiler failure', async () => {
    const fixture = await project();
    await writeFile(fixture.config, 'throw new Error("broken generator config");\n');
    await expect(start(fixture)).rejects.toThrow(/DISCOVERY_MODULE_BUILD_FAILED|evaluation/i);
    await writeConfiguration(fixture.config);
    const recovered = await start(fixture);
    expect(recovered).toBeDefined();
  }, 60_000);

  it('rejects a missing component probe with an actionable startup diagnostic', async () => {
    const fixture = await project();
    await rm(fixture.app);
    const server = await start(fixture);
    await expect(server.listen()).rejects.toThrow(/ANGULAR_PROBE|angularComponentProbe/);
  }, 60_000);

  it('excludes configuration-resolved output roots before the initial commit writes them', async () => {
    const fixture = await project();
    await writeConfiguration(fixture.config, 'configured-output');
    await start(fixture);
    const configured = path.join(fixture.root, 'configured-output/ng-doc/vite-fixture');
    expect(await readFile(path.join(configured, 'index.ts'), 'utf8')).toContain(
      "export * from './routes'",
    );
    expect(existsSync(path.join(fixture.output, 'index.ts'))).toBe(false);
  }, 60_000);

  it('observes imported generated modules from a configured external output root', async () => {
    const fixture = await project();
    const externalParent = path.join(await directory(), 'published');
    await writeConfiguration(fixture.config, path.relative(fixture.root, externalParent));
    const actual = path.join(externalParent, 'ng-doc/vite-fixture');
    const updates: string[] = [];
    const server = await start(fixture, [
      {
        name: 'external-generated-observer',
        hotUpdate(context: HotUpdateOptions) {
          updates.push(context.file);
        },
      },
    ]);
    await server.listen();
    const address = server.httpServer?.address();
    if (!address || typeof address === 'string') throw new Error('Missing Vite address');
    expect((await fetch(`http://127.0.0.1:${address.port}/preview/src/main.ts`)).status).toBe(200);
    expect(await server.transformRequest(`/@fs/${path.join(actual, 'routes.ts')}`)).toBeDefined();
    const [generatedPage] = await filesWithSuffix(actual, 'page.ts');
    expect(generatedPage).toBeDefined();
    expect(await server.transformRequest(`/@fs/${generatedPage}`)).toBeDefined();
    // Browser navigation imports the stable facade and then its separate payload.
    // Prose no longer rewrites the Angular shell that this fixture used to observe.
    const generatedContent = await filesWithSuffix(actual, '.content.mjs');
    expect(generatedContent.length).toBeGreaterThan(0);
    for (const file of generatedContent) {
      expect(
        await server.transformRequest(`/@fs/${file.replace('.content.mjs', '.source.mjs')}`),
      ).toBeDefined();
      expect(await server.transformRequest(`/@fs/${file}`)).toBeDefined();
    }
    await writeFile(fixture.markdown, '# Guide\nConfigured external output update.\n');
    await waitFor(async () =>
      (await readFile(path.join(actual, 'assets/indexes.json'), 'utf8')).includes(
        'Configured external output update',
      ),
    );
    await waitFor(async () => updates.some((file) => generatedContent.includes(file)));
  }, 60_000);

  it('watches generated modules that a configured outDir publishes inside the cache root', async () => {
    const fixture = await project();
    // outDir "cache" publishes <root>/cache/ng-doc/vite-fixture: the output is inside cacheRoot,
    // so the config-time cache ignore must be dropped at admission (it fails open).
    await writeConfiguration(fixture.config, path.relative(fixture.root, fixture.cache));
    const actual = path.join(fixture.cache, 'ng-doc/vite-fixture');
    const updates: string[] = [];
    const server = await start(fixture, [
      {
        name: 'cached-output-observer',
        hotUpdate(context: HotUpdateOptions) {
          updates.push(context.file);
        },
      },
    ]);
    await server.listen();
    expect(await readFile(path.join(actual, 'index.ts'), 'utf8')).toContain(
      "export * from './routes'",
    );
    const isIgnored = (
      server.watcher as unknown as { _isIgnored(file: string): boolean }
    )._isIgnored.bind(server.watcher);
    expect(isIgnored(path.join(actual, 'routes.ts'))).toBe(false);
    expect(isIgnored(path.join(fixture.cache, 'x.artifact.json'))).toBe(false);
    const generatedContent = await filesWithSuffix(actual, '.content.mjs');
    expect(generatedContent.length).toBeGreaterThan(0);
    await writeFile(fixture.markdown, '# Guide\nOutput inside the cache root update.\n');
    await waitFor(async () =>
      (await readFile(path.join(actual, 'assets/indexes.json'), 'utf8')).includes(
        'Output inside the cache root update',
      ),
    );
    await waitFor(async () => updates.some((file) => generatedContent.includes(file)));
  }, 60_000);

  it('rejects a configured-root collision before changing the active owner output', async () => {
    const first = await project();
    const second = await project();
    const sharedParent = path.join(await directory(), 'published');
    await writeConfiguration(first.config, path.relative(first.root, sharedParent));
    await writeConfiguration(second.config, path.relative(second.root, sharedParent));
    await start(first);
    const sharedRoot = path.join(sharedParent, 'ng-doc', 'vite-fixture');
    const manifestFile = path.join(sharedRoot, '.ng-doc-output-manifest.json');
    const manifest = await readFile(manifestFile, 'utf8');
    const index = await readFile(path.join(sharedRoot, 'index.ts'), 'utf8');

    await expect(start(second)).rejects.toThrow(/BOOTSTRAP_ADMISSION_FAILED|already active/);
    expect(await readFile(manifestFile, 'utf8')).toBe(manifest);
    expect(await readFile(path.join(sharedRoot, 'index.ts'), 'utf8')).toBe(index);
  }, 60_000);

  it('keeps last-good output on a restart-required configuration and clears after exact repair', async () => {
    const fixture = await project();
    const server = await start(fixture);
    await server.listen();
    const address = server.httpServer?.address();
    if (!address || typeof address === 'string') throw new Error('Missing Vite address');
    const origin = `http://127.0.0.1:${address.port}`;
    const manifestFile = path.join(fixture.output, '.ng-doc-output-manifest.json');
    const manifest = await readFile(manifestFile, 'utf8');
    const index = await readFile(path.join(fixture.output, 'index.ts'), 'utf8');

    await writeConfiguration(fixture.config, 'moved-output');
    await waitFor(async () => (await html(origin)).status === 500);
    expect((await html(origin)).body).toContain('RESTART_REQUIRED');
    expect(await readFile(manifestFile, 'utf8')).toBe(manifest);
    expect(await readFile(path.join(fixture.output, 'index.ts'), 'utf8')).toBe(index);
    expect(existsSync(path.join(fixture.root, 'moved-output/ng-doc/vite-fixture'))).toBe(false);

    await writeConfiguration(fixture.config);
    await waitFor(async () => (await html(origin)).status === 200);
    expect(await readFile(path.join(fixture.output, 'index.ts'), 'utf8')).toBe(index);
  }, 60_000);

  it('finishes physical generation before real Analog AOT buildStart compilation', async () => {
    const fixture = await project();
    let generatedAtBuildStart = false;
    // Info lines are recorded, everything else stays silent: NgDoc's progress is on.
    const logged: string[] = [];
    const logger = createLogger('silent');
    logger.info = (message) => void logged.push(message);
    await viteBuild({
      root: fixture.root,
      configFile: false,
      customLogger: logger,
      plugins: [
        plugin(
          fixture,
          aotAngular({
            tsconfig: fixture.tsconfig,
            workspaceRoot: repository,
            disableTypeChecking: false,
            jit: false,
            inlineStylesExtension: 'scss',
            include: [`${fixture.root}/**/*.ts`, `${fixture.output}/**/*.ts`],
            liveReload: true,
          }),
        ),
        {
          name: 'ng-doc-order-observer',
          buildStart() {
            generatedAtBuildStart = existsSync(path.join(fixture.output, 'index.ts'));
          },
        },
      ],
      resolve: { alias: packageAliases(), dedupe: angularPackages() },
      // Source maps only when the configuration asks for them, as in the Angular CLI.
      build: { outDir: path.join(fixture.root, 'bundle'), emptyOutDir: true, sourcemap: true },
      ssr: { noExternal: ['@ng-doc/app', '@ng-doc/ui-kit', '@ng-doc/core'] },
    });
    expect(generatedAtBuildStart).toBe(true);
    const ngDoc = logged.filter((line) => line.startsWith('NgDoc:'));
    expect(ngDoc[0]).toBe('NgDoc: generating documentation for vite-fixture (production)');
    const summary = ngDoc.at(-1)!;
    expect(summary).toMatch(/^NgDoc: OK generated \d+ pages? in \d+\.\ds; /);
    // Before Vite reports its own bundle work (Vite 8 reports the bundle as `✓ built in …`).
    const transformed = logged.findIndex((line) => /modules? transformed|built in/.test(line));
    expect(transformed).toBeGreaterThan(-1);
    expect(logged.indexOf(summary)).toBeLessThan(transformed);
    expect(await readFile(path.join(fixture.root, 'bundle/index.html'), 'utf8')).toContain(
      'data-ng-doc-theme-restore',
    );
    const maps = await filesWithSuffix(path.join(fixture.root, 'bundle'), '.map');
    expect(maps.length).toBeGreaterThan(0);
    const sourceMaps = await Promise.all(
      maps.map(async (file) => JSON.parse(await readFile(file, 'utf8'))),
    );
    expect(
      sourceMaps.some((map) => typeof map.mappings === 'string' && map.mappings.length > 0),
    ).toBe(true);
    expect(
      sourceMaps.some((map) =>
        (map.sources as string[] | undefined)?.some((source) =>
          /generated\/(?:routes|context)\.ts$/.test(source),
        ),
      ),
    ).toBe(true);
  }, 90_000);

  it('generates once for the builds of one production pipeline that share its handoff', async () => {
    const fixture = await project();
    const handoff: Plugin = {
      name: 'generation-handoff',
      api: { ngDocGeneration: { schemaVersion: 1 } },
    };
    const logged: string[] = [];
    const logger = createLogger('silent');
    logger.info = (message) => void logged.push(message);
    const generations = () =>
      logged.filter((line) => line.startsWith('NgDoc: generating documentation')).length;
    // Each build gets new plugin instances, as when a pipeline loads the configuration again.
    const build = (outDir: string, plugins: Plugin[], mode?: string) =>
      viteBuild({
        root: fixture.root,
        configFile: false,
        customLogger: logger,
        ...(mode ? { mode } : {}),
        plugins: [
          plugin(
            fixture,
            aotAngular({
              tsconfig: fixture.tsconfig,
              workspaceRoot: repository,
              disableTypeChecking: false,
              jit: false,
              inlineStylesExtension: 'scss',
              include: [`${fixture.root}/**/*.ts`, `${fixture.output}/**/*.ts`],
              liveReload: true,
            }),
          ),
          ...plugins,
        ],
        resolve: { alias: packageAliases(), dedupe: angularPackages() },
        build: { outDir: path.join(fixture.root, outDir), emptyOutDir: true },
        ssr: { noExternal: ['@ng-doc/app', '@ng-doc/ui-kit', '@ng-doc/core'] },
      });
    const manifest = path.join(fixture.output, '.ng-doc-output-manifest.json');
    const assets = async (outDir: string) => {
      const root = path.join(fixture.root, outDir, 'assets/ng-doc');
      const files = await filesWithSuffix(root, '');
      return Promise.all(
        files.map(async (file) => [path.relative(root, file), await readFile(file, 'utf8')]),
      );
    };

    await build('first', [handoff]);
    expect(generations()).toBe(1);
    // A production build that does not ask for source maps emits none.
    expect(await filesWithSuffix(path.join(fixture.root, 'first'), '.map')).toEqual([]);
    const published = await readFile(manifest, 'utf8');
    // The second build publishes the first one's generation: nothing is generated or written, and
    // it bundles and emits exactly what the first did.
    await build('second', [handoff]);
    expect(generations()).toBe(1);
    expect(await readFile(manifest, 'utf8')).toBe(published);
    expect((await assets('second')).length).toBeGreaterThan(0);
    expect(await assets('second')).toEqual(await assets('first'));
    expect(await readFile(path.join(fixture.root, 'second/index.html'), 'utf8')).toBe(
      await readFile(path.join(fixture.root, 'first/index.html'), 'utf8'),
    );
    // Another writer committed to the output root in between: the recorded generation is not
    // what it publishes any more, so the build generates (and records the new one).
    const tampered = JSON.parse(published) as OutputManifest;
    await writeFile(manifest, `${JSON.stringify({ ...tampered, generation: 99 }, null, 2)}\n`);
    await build('third', [handoff]);
    expect(generations()).toBe(2);
    expect(JSON.parse(await readFile(manifest, 'utf8')).generation).not.toBe(99);
    expect(await assets('third')).toEqual(await assets('first'));
    // The kill switch: the build generates although the recorded generation is current.
    const previous = process.env['NGDOC_VITE_BUILD_HANDOFF'];
    process.env['NGDOC_VITE_BUILD_HANDOFF'] = '0';
    try {
      await build('fourth', [handoff]);
    } finally {
      if (previous === undefined) delete process.env['NGDOC_VITE_BUILD_HANDOFF'];
      else process.env['NGDOC_VITE_BUILD_HANDOFF'] = previous;
    }
    expect(generations()).toBe(3);
    // Other generator options (the mode's tags): the build generates.
    await build('fifth', [handoff], 'staging');
    expect(generations()).toBe(4);
  }, 240_000);

  it('preflights a real Angular component and witnesses an unimported resource update', async () => {
    const fixture = await project();
    const angularPlugins = angular({
      tsconfig: fixture.tsconfig,
      workspaceRoot: fixture.root,
      disableTypeChecking: false,
      jit: false,
      liveReload: true,
    });
    const compiler = angularPlugins.find(
      (candidate) => candidate.name === '@analogjs/vite-plugin-angular',
    );
    if (!compiler || typeof compiler.handleHotUpdate !== 'function') {
      throw new Error('Missing Analog compiler hook');
    }
    const original = compiler.handleHotUpdate;
    const resources: Array<{ file: string; modules: number; text: string }> = [];
    const completed: Array<{ file: string; text: string }> = [];
    compiler.handleHotUpdate = async function (context: HmrContext) {
      if (/\.html$/.test(context.file)) {
        resources.push({
          file: context.file,
          modules: context.modules.length,
          text: await context.read(),
        });
      }
      return original.call(this, context);
    };
    const ngDocPlugins = plugin(fixture, angularPlugins);
    expect(ngDocPlugins).toContain(angularPlugins[1]);
    const server = await createServer({
      root: fixture.root,
      // Its own dependency cache (below a node_modules folder, as linters and editors skip): the
      // default one is shared by every fixture.
      cacheDir: path.join(fixture.root, '.vite/node_modules/.vite'),
      configFile: false,
      logLevel: 'silent',
      plugins: [
        ngDocPlugins,
        {
          name: 'resource-completion-observer',
          async handleHotUpdate(context: HmrContext) {
            if (/\.html$/.test(context.file)) {
              completed.push({ file: context.file, text: await context.read() });
            }
          },
        },
      ],
      resolve: { alias: packageAliases(), dedupe: angularPackages() },
      server: { host: '127.0.0.1', port: 0 },
    });
    servers.push(server);
    await server.listen();
    const marker = 'updated cold external resource marker';
    await writeFile(fixture.coldResource, marker);
    await waitFor(
      async () =>
        completed.some(({ file, text }) => file === fixture.coldResource && text === marker) &&
        resources.some(({ file, text }) => file === fixture.coldResource && text === marker),
    );
    const observedResource = resources.find(
      ({ file, text }) => file === fixture.coldResource && text === marker,
    );
    expect(observedResource).toEqual({
      file: fixture.coldResource,
      modules: 0,
      text: marker,
    });
    expect(resources.every(({ modules }) => Number.isInteger(modules))).toBe(true);
    expect(
      server.config.plugins.filter(({ name }) => name === '@analogjs/vite-plugin-angular'),
    ).toHaveLength(1);
    // A real Analog server with a live generator session must close promptly: a hang here would
    // leave a developer's `vite` process running after Ctrl+C.
    await closeWithin(server, 15_000);
    servers.splice(servers.indexOf(server), 1);
  }, 60_000);

  it('bounds a Vite close that waits on a never-settling request, after releasing its own processes', async () => {
    const fixture = await project();
    const warnings: string[] = [];
    const logger = createLogger('silent');
    logger.warn = (message) => void warnings.push(message);
    let entered!: () => void;
    const loading = new Promise<void>((resolve) => (entered = resolve));
    const server = await createServer({
      root: fixture.root,
      // Its own dependency cache (below a node_modules folder, as linters and editors skip): the
      // default one is shared by every fixture.
      cacheDir: path.join(fixture.root, '.vite/node_modules/.vite'),
      configFile: false,
      base: '/preview/',
      customLogger: logger,
      plugins: [
        plugin(fixture),
        {
          // A request whose load never settles keeps environment.close() waiting forever (Vite 7
          // left such a request behind when a close cancelled a first dependency optimization;
          // Vite 8 settles those). This load reproduces such a pending request.
          name: 'never-settling-load',
          resolveId: (id: string) =>
            id === 'virtual:never-settles' ? '\0virtual:never-settles' : null,
          load(id: string) {
            if (id !== '\0virtual:never-settles') return null;
            entered();
            return new Promise<never>(() => {});
          },
        },
      ],
      resolve: { alias: packageAliases(), dedupe: angularPackages() },
      server: { host: '127.0.0.1', port: 0 },
    });
    servers.push(server);
    await server.listen();
    void server.environments.client.transformRequest('virtual:never-settles').catch(() => {});
    await loading;

    await closeWithin(server, 15_000);
    servers.splice(servers.indexOf(server), 1);

    const timeouts = warnings.filter((message) => message.includes('[NGDOC_VITE_CLOSE_TIMEOUT]'));
    expect(timeouts).toHaveLength(1);
    expect(ownedChildProcesses()).toEqual([]);
    // The output lease was released too: a new server can own the same output root.
    await start(fixture);
  }, 60_000);
});

describe('watch input semantics', () => {
  // chokidar picks FSEvents where it can (macOS), else `fs.watch` (Linux): both backends run here.
  it.each([
    { backend: 'the default', watch: undefined },
    { backend: 'the fs.watch', watch: { useFsEvents: false, usePolling: false } },
  ])(
    'keeps transactional staging TypeScript out of Vite hot-update hooks ($backend backend)',
    async ({ watch }) => {
      const root = await directory();
      const updates: string[] = [];
      const server = await createServer({
        root,
        // Its own dependency cache (below a node_modules folder, as linters and editors skip): the
        // default one is shared by every fixture.
        cacheDir: path.join(root, '.vite/node_modules/.vite'),
        configFile: false,
        logLevel: 'silent',
        server: {
          host: '127.0.0.1',
          port: 0,
          watch: { ...watch, ignored: [GENERATED_STAGE_IGNORE] },
        },
        plugins: [
          {
            name: 'hot-update-observer',
            hotUpdate(context: HotUpdateOptions) {
              updates.push(context.file);
            },
          },
        ],
      });
      servers.push(server);
      await server.listen();
      // A file created before the root's read is taken as initial and never reported, and the
      // `fs.watch` backend (Linux) reads a directory before it attaches its listener.
      await nativelyWatched(server.watcher, [root]);
      const stage = path.join(root, '.ng-doc-stage-test/outputs/api/page.ts');
      const control = path.join(root, 'control.ts');
      await mkdir(path.dirname(stage), { recursive: true });
      await writeFile(stage, 'export const staged = true;');
      await writeFile(control, 'export const control = true;');
      await waitFor(async () => updates.includes(control));
      expect(updates.some((file) => file.includes('.ng-doc-stage-'))).toBe(false);
    },
  );

  // chokidar picks FSEvents where it can (macOS), else `fs.watch` (Linux, Windows). Without
  // FSEvents on macOS it polls unless told not to, so both of its other backends are pinned here;
  // on Linux the first two cases run `fs.watch` (inotify).
  it.each([
    { backend: 'the default', watch: undefined },
    { backend: 'the fs.watch', watch: { useFsEvents: false, usePolling: false } },
    { backend: 'the polling', watch: { useFsEvents: false, usePolling: true, interval: 20 } },
  ])(
    'observes independently registered missing siblings without admitting unrelated files ($backend backend)',
    async ({ watch }) => {
      const root = await directory();
      const external = await directory();
      const first = path.join(external, '.prettierrc');
      const second = path.join(external, '.editorconfig');
      const unrelated = path.join(external, '.unrelatedrc');
      let source: ViteFileEventSource | undefined = undefined;
      const server = await createServer({
        root,
        // Its own dependency cache (below a node_modules folder, as linters and editors skip): the
        // default one is shared by every fixture.
        cacheDir: path.join(root, '.vite/node_modules/.vite'),
        configFile: false,
        logLevel: 'silent',
        server: {
          host: '127.0.0.1',
          port: 0,
          ...(watch ? { watch } : {}),
        },
        plugins: [
          {
            name: 'forward-native-hot-updates',
            enforce: 'pre',
            hotUpdate(context: HotUpdateOptions) {
              source?.forward({ kind: context.type, path: context.file });
            },
          },
        ],
      });
      servers.push(server);
      await server.listen();
      const fsEvents = (server.watcher as unknown as { options: { useFsEvents: boolean } }).options
        .useFsEvents;
      source = new ViteFileEventSource(server.watcher, 10);
      const ready = path.join(external, '.ready');
      await source.seed(1, inputs([first, second, ready]));
      const events: Array<{ kind: string; path: string }> = [];
      const subscription = await source.subscribe(
        (batch) => events.push(...batch),
        () => {},
      );
      // FSEvents reports each missing path natively. The other backends report only one missing
      // path per directory, so the event source watches the directory itself.
      if (fsEvents) await nativelyWatched(server.watcher, [first, second]);
      else await reportedOnce(ready, events);

      await writeFile(unrelated, 'ignored');
      await writeFile(first, 'one');
      await writeFile(second, 'two');
      await waitFor(async () => events.some((event) => event.path === first));
      await waitFor(async () => events.some((event) => event.path === second));
      expect(events.some((event) => event.path === unrelated)).toBe(false);
      const watched = (
        server.watcher as unknown as { getWatched(): Record<string, readonly string[]> }
      ).getWatched();
      const externalEntries = Object.entries(watched)
        .filter(([directory]) => path.resolve(directory) === path.resolve(external))
        .flatMap(([, entries]) => entries);
      if (fsEvents) {
        expect(externalEntries).toEqual(expect.arrayContaining(['.prettierrc', '.editorconfig']));
      } else {
        expect(externalEntries).not.toContain('.editorconfig');
      }
      expect(externalEntries).not.toContain('.unrelatedrc');

      const updateStart = events.length;
      await writeFile(first, 'changed');
      await waitFor(async () => events.slice(updateStart).some((event) => event.path === first));
      await rm(second);
      await waitFor(async () =>
        events.some((event) => event.path === second && event.kind === 'delete'),
      );
      await writeFile(second, 'recreated');
      await waitFor(
        async () =>
          events.filter((event) => event.path === second && event.kind === 'create').length >= 2,
      );
      const replacement = path.join(external, 'replacement.tmp');
      const replacementStart = events.length;
      await writeFile(replacement, 'atomic');
      await rename(replacement, first);
      await waitFor(async () =>
        events.slice(replacementStart).some((event) => event.path === first),
      );

      await subscription.dispose();
    },
    30_000,
  );

  it("reports each created missing input once on the fs.watch backend, inside Vite's root or not", async () => {
    const root = await directory();
    const external = await directory();
    const served = path.join(root, 'served.ts');
    const both = path.join(external, 'both.ts');
    let source: ViteFileEventSource | undefined = undefined;
    const server = await createServer({
      root,
      // Its own dependency cache (below a node_modules folder, as linters and editors skip): the
      // default one is shared by every fixture.
      cacheDir: path.join(root, '.vite/node_modules/.vite'),
      configFile: false,
      logLevel: 'silent',
      server: { host: '127.0.0.1', port: 0, watch: { useFsEvents: false, usePolling: false } },
      plugins: [
        {
          name: 'forward-native-hot-updates',
          enforce: 'pre',
          hotUpdate(context: HotUpdateOptions) {
            // Once per change, as the plugin does: Vite calls the hook for every environment.
            if (this.environment.name === 'client') {
              source?.forward({ kind: context.type, path: context.file });
            }
          },
        },
      ],
    });
    servers.push(server);
    await server.listen();
    // Vite watches its root; `external` is watched in full too, as another plugin could do.
    server.watcher.add(external);
    source = new ViteFileEventSource(server.watcher, 10, { watchedRoots: [root] });
    const ready = path.join(external, 'ready.ts');
    await source.seed(1, inputs([served, both, ready]));
    // The root's own watch reports `served`: it gets no second listener.
    const missing = (source as unknown as { missing: { has(target: string): boolean } }).missing;
    expect(missing.has(normalizePath(served))).toBe(false);
    expect(missing.has(normalizePath(both))).toBe(true);
    expect(await source.attached([served])).toBe(true);
    const events: Array<{ kind: string; path: string }> = [];
    const subscription = await source.subscribe(
      (batch) => events.push(...batch),
      () => {},
    );
    const seen: string[] = [];
    server.watcher.on('add', (file: string) => seen.push(file));
    await nativelyWatched(server.watcher, [root, external]);
    await reportedOnce(ready, events);

    await writeFile(served, 'export {};');
    await writeFile(both, 'export {};');
    await waitFor(async () => events.some((event) => event.path === normalizePath(served)));
    await waitFor(async () => events.some((event) => event.path === normalizePath(both)));
    await waitFor(async () => seen.includes(both));
    await new Promise((resolve) => setTimeout(resolve, 300));
    // One creation each; a write that lands after the creation is an update of its own.
    const creates = (file: string) =>
      events.filter((event) => event.path === normalizePath(file) && event.kind === 'create');
    expect(creates(served)).toHaveLength(1);
    expect(creates(both)).toHaveLength(1);
    await subscription.dispose();
  }, 30_000);

  it('keeps the last success plus only the latest failure and rejects stale/cancelled observations', async () => {
    const root = await directory();
    const success = path.join(root, 'success.md');
    const firstMissing = path.join(root, 'missing/first.md');
    const secondMissing = path.join(root, 'other/second.md');
    await writeFile(success, 'ok');
    const registry = new WatchInputRegistry(20);

    await registry.observe(result('success', 1, inputs([success])));
    await registry.observe(result('failure', 2, inputs([firstMissing])));
    expect(registry.snapshot().files).toEqual([firstMissing, success].sort());
    await registry.observe(result('failure', 3, inputs([secondMissing])));
    expect(registry.snapshot().files).toEqual([secondMissing, success].sort());
    await registry.observe(result('failure', 4));
    expect(registry.snapshot().files).toEqual([secondMissing, success].sort());
    registry.started(6);
    expect((await registry.observe(result('failure', 5, inputs([firstMissing])))).accepted).toBe(
      false,
    );
    expect((await registry.observe(result('cancelled', 7))).accepted).toBe(false);

    const pending = registry.observe(
      result('failure', 8, inputs([], [{ root, include: ['late/**/*.md'], exclude: [] }])),
    );
    registry.started(9);
    expect((await pending).accepted).toBe(false);
    expect(registry.snapshot().files).toEqual([secondMissing, success].sort());
  });

  it('matches exact missing ancestors and relative and absolute glob membership with excludes', async () => {
    const root = await directory();
    const registry = new WatchInputRegistry(20);
    const exact = path.join(root, 'new/deep/file.md');
    const planned = await registry.observe(
      result(
        'success',
        1,
        inputs(
          [exact],
          [
            {
              root,
              include: ['docs/**/*.md', path.join(root, 'api/**/*.ts')],
              exclude: ['**/skip/**'],
            },
          ],
        ),
      ),
    );
    expect(registry.physicalCount()).toBe(0);
    registry.confirmPhysical(planned.physicalAdded);
    expect(registry.matches({ kind: 'create', path: path.join(root, 'new') })).toBe(true);
    expect(registry.matches({ kind: 'create', path: path.join(root, 'docs/guide.md') })).toBe(true);
    expect(registry.matches({ kind: 'create', path: path.join(root, 'docs/skip/no.md') })).toBe(
      false,
    );
    expect(registry.matches({ kind: 'create', path: path.join(root, 'api/button.ts') })).toBe(true);
    expect(registry.matches({ kind: 'create', path: path.join(root, 'unrelated.txt') })).toBe(
      false,
    );
    await expect(
      registry.observe(result('failure', 2, inputs([path.parse(root).root]))),
    ).rejects.toThrow('filesystem-root file watch');
    await expect(
      new WatchInputRegistry(1).observe(
        result('success', 1, inputs([path.join(root, 'one'), path.join(root, 'two')])),
      ),
    ).rejects.toThrow('configured maximum is 1');
    await expect(
      new WatchInputRegistry(10).observe(
        result('success', 1, inputs([], [{ root, include: ['/**/*.ts'], exclude: [] }])),
      ),
    ).rejects.toThrow('filesystem-root glob watch');
    expect(registry.physicalCount()).toBeGreaterThan(0);
  });

  it.each([
    ...['(', ')', '[', ']', '{', '}', '!', '+', '@', '|'].map((character) => ({
      include: `src/*/n${character}m/*.ts`,
      added: `src/a/n${character}m/f.ts`,
      other: 'src/a/nzm/f.ts',
      overIncludes: character === '!',
    })),
    {
      include: 'src/app/**/(auth)/*.ts',
      added: 'src/app/x/(auth)/login.ts',
      other: 'src/app/x/auth/login.ts',
      overIncludes: false,
    },
    {
      include: 'src/*/[id].ts',
      added: 'src/users/[id].ts',
      other: 'src/users/i.ts',
      overIncludes: false,
    },
  ])(
    'matches post-readiness events for recorded tsconfig membership $include',
    async ({ include, added, other, overIncludes }) => {
      const root = await directory();
      await mkdir(path.join(root, 'src'), { recursive: true });
      await writeFile(path.join(root, 'src/main.ts'), 'export {};');
      await writeFile(
        path.join(root, 'tsconfig.json'),
        JSON.stringify({
          compilerOptions: { noLib: true },
          files: ['src/main.ts'],
          include: [include],
        }),
      );
      const configFile = path.join(root, 'tsconfig.json');
      const parsed = ts.getParsedCommandLineOfConfigFile(
        configFile,
        {},
        {
          ...ts.sys,
          onUnRecoverableConfigFileDiagnostic: () => {},
        },
      )!;
      const recorded = await tsconfigMembershipDependencies(
        parsed,
        configFile,
        new OwnedRoots([path.join(root, 'generated')]),
      );
      const globs = recorded.flatMap((item) =>
        item.kind === 'glob'
          ? [{ root: item.root, include: item.include, exclude: item.exclude }]
          : [],
      );
      expect(globs.flatMap((glob) => glob.include).join()).not.toContain('\\');
      const registry = new WatchInputRegistry(20);
      await registry.observe(result('success', 1, inputs([], globs)));
      // Nothing matched when recorded; the first matching file created later is an input event.
      expect(registry.matches({ kind: 'create', path: path.join(root, added) })).toBe(true);
      expect(registry.matches({ kind: 'create', path: path.join(root, other) })).toBe(overIncludes);
    },
  );

  it('keeps POSIX backslash escapes in watched glob patterns', async () => {
    const root = await directory();
    const registry = new WatchInputRegistry(20);
    await registry.observe(
      result('success', 1, inputs([], [{ root, include: ['src/*/\\(auth\\)/*.ts'], exclude: [] }])),
    );
    expect(registry.matches({ kind: 'create', path: path.join(root, 'src/a/(auth)/x.ts') })).toBe(
      path.sep === '/',
    );
    expect(registry.matches({ kind: 'create', path: path.join(root, 'src/a/auth/x.ts') })).toBe(
      false,
    );
  });

  it('attaches and removes only adapter listeners while preserving the shared watcher', async () => {
    const root = await directory();
    const watched = path.join(root, 'watched.md');
    await writeFile(watched, 'one');
    const events: unknown[] = [];
    const diagnostics: unknown[] = [];
    const watcher = new FakeWatcher();
    const source = new ViteFileEventSource(watcher as unknown as FSWatcher, 10);
    await source.seed(1, inputs([watched]));
    const subscription = await source.subscribe(
      (value) => events.push(...value),
      (value) => diagnostics.push(value),
    );
    expect(source.forward({ kind: 'update', path: watched })).toBe(true);
    expect(source.forward({ kind: 'update', path: path.join(root, 'unrelated.md') })).toBe(false);
    watcher.emit('error', new Error('native watcher failed'));
    watcher.emit('error', 'string watcher failure');
    expect(events).toEqual([{ kind: 'update', path: watched }]);
    expect(diagnostics).toEqual([
      expect.objectContaining({ code: 'NGDOC_VITE_WATCHER' }),
      expect.objectContaining({ message: 'string watcher failure' }),
    ]);
    await subscription.dispose();
    expect(source.forward({ kind: 'update', path: watched })).toBe(false);
    expect(events).toHaveLength(1);
    expect(watcher.close).not.toHaveBeenCalled();
    expect(watcher.unwatch).not.toHaveBeenCalled();
    expect(source.isCurrent(1)).toBe(false);
    expect(await source.seed(2)).toEqual({ accepted: true, reconcile: false });
    expect(await source.observe(result('failure', 2))).toEqual({
      accepted: false,
      reconcile: false,
    });
    await expect(
      source.subscribe(
        () => {},
        () => {},
      ),
    ).rejects.toThrow('disposed');
  });

  it('filters owned outputs from broad inputs and retries a synchronous add failure', async () => {
    const root = await directory();
    const output = path.join(root, 'generated');
    const cache = path.join(root, 'cache');
    const watcher = new FakeWatcher();
    watcher.failAdds = 1;
    const source = new ViteFileEventSource(watcher as unknown as FSWatcher, 10);
    source.excludeOwned(output, cache);
    const broad = inputs([], [{ root, include: ['**/*.ts'], exclude: [] }]);
    await expect(source.seed(1, broad)).rejects.toThrow('registration failed');
    expect((await source.seed(2, broad)).reconcile).toBe(true);
    expect(watcher.added).toContain(root);

    const events: unknown[] = [];
    const subscription = await source.subscribe(
      (batch) => events.push(...batch),
      () => {},
    );
    expect(source.forward({ kind: 'update', path: path.join(output, 'routes.ts') })).toBe(false);
    expect(source.forward({ kind: 'update', path: path.join(cache, 'memo.ts') })).toBe(false);
    expect(source.forward({ kind: 'update', path: path.join(root, 'src/app.ts') })).toBe(true);
    expect(events).toEqual([{ kind: 'update', path: path.join(root, 'src/app.ts') }]);
    await subscription.dispose();

    const staleWatcher = new FakeWatcher();
    const staleSource = new ViteFileEventSource(staleWatcher as unknown as FSWatcher, 10);
    const candidate = path.join(root, 'candidate.json');
    const stale = staleSource.observe(result('success', 1, inputs([candidate])));
    queueMicrotask(() => staleSource.started(2));
    expect(await stale).toEqual({ accepted: false, reconcile: false });
    expect(staleWatcher.added).toEqual([]);
    expect((await staleSource.observe(result('success', 2, inputs([candidate])))).accepted).toBe(
      true,
    );
    expect(staleWatcher.added).toEqual([candidate]);
    await staleSource.dispose();
  });

  it('buffers a pre-subscription hot update and flushes it into the same event source', async () => {
    const root = await directory();
    const watched = path.join(root, 'docs/guide.md');
    const source = new ViteFileEventSource(new FakeWatcher() as unknown as FSWatcher, 10);
    expect(source.forward({ kind: 'update', path: watched })).toBe(true);
    await source.seed(1, inputs([watched]));
    const events: FileChange[] = [];
    const subscription = await source.subscribe(
      (batch) => events.push(...batch),
      () => {},
    );
    expect(events).toEqual([{ kind: 'update', path: watched }]);
    await subscription.dispose();
  });

  it('does not flush buffered changes after disposal begins during registration', async () => {
    const root = await directory();
    const watched = path.join(root, 'docs/guide.md');
    const source = new ViteFileEventSource(new FakeWatcher() as unknown as FSWatcher, 10);
    let release = (): void => {};
    const registration = new Promise<void>((resolve) => {
      release = resolve;
    });
    (source as unknown as { registration: Promise<void> }).registration = registration;
    expect(source.forward({ kind: 'update', path: watched })).toBe(true);
    const listener = vi.fn();
    const subscribing = source.subscribe(listener, () => {});
    const disposing = source.dispose();
    release();
    await expect(subscribing).rejects.toThrow('disposed');
    await disposing;
    expect(listener).not.toHaveBeenCalled();
  });

  it('does not publish or surface a stale result after a newer generation starts', async () => {
    const root = await directory();
    const watcher = new FakeWatcher();
    const source = new ViteFileEventSource(watcher as unknown as FSWatcher, 10);
    const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn() };
    const server = { config: { logger }, ws: { send: vi.fn() } } as unknown as ViteDevServer;
    const lifecycle = new ViteAdapterLifecycle(acquireOutputLease(`stale-${Date.now()}`, root));
    lifecycle.attachServer(server, source);
    const observer = lifecycle.observer(() => configuration(root, 'assets'));
    observer({ kind: 'started', generation: 3, changes: [] });
    observer({
      kind: 'result',
      result: {
        ...result('failure', 2, inputs([path.join(root, 'stale.md')])),
        diagnostics: [
          { code: 'STALE', message: 'must be ignored', severity: 'error', stage: 'host' },
        ],
      },
    });
    await lifecycle.settled();
    expect(lifecycle.failure).toBeUndefined();
    expect(lifecycle.configuration).toBeUndefined();
    expect(logger.error).not.toHaveBeenCalled();
    expect(server.ws.send).not.toHaveBeenCalled();
    await lifecycle.dispose();
  });

  it('suppresses a stale rejected observation after a newer generation starts', async () => {
    const root = await directory();
    let latest = -1;
    const source = {
      started: (generation: number) => {
        latest = generation;
      },
      isCurrent: (generation: number) => generation >= latest,
      observe: vi.fn(async () => {
        throw new Error('stale registration failure');
      }),
      dispose: vi.fn(async () => {}),
    } as unknown as ViteFileEventSource;
    const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn() };
    const server = { config: { logger }, ws: { send: vi.fn() } } as unknown as ViteDevServer;
    const lifecycle = new ViteAdapterLifecycle(
      acquireOutputLease(`stale-catch-${Date.now()}`, root),
    );
    lifecycle.attachServer(server, source);
    const observer = lifecycle.observer(() => configuration(root, 'assets'));
    observer({ kind: 'started', generation: 1, changes: [] });
    observer({ kind: 'result', result: result('failure', 1) });
    observer({ kind: 'started', generation: 2, changes: [] });
    await lifecycle.settled();
    expect(lifecycle.failure).toBeUndefined();
    expect(logger.error).not.toHaveBeenCalled();
    await lifecycle.dispose();
  });

  it('drains a reconciliation result and retains its newer failure', async () => {
    const root = await directory();
    const source = new ViteFileEventSource(new FakeWatcher() as unknown as FSWatcher, 10);
    const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn() };
    const server = { config: { logger }, ws: { send: vi.fn() } } as unknown as ViteDevServer;
    const newerFailure = result('failure', 3);
    // The re-observation admits a change, and the generation it schedules fails. Its result
    // arrives through the observer while the lifecycle is still reconciling.
    const session = {
      reconcileInputs: vi.fn(async () => {
        observer({ kind: 'started', generation: 3, changes: [] });
        observer({ kind: 'result', result: newerFailure });
      }),
      rescan: vi.fn(async () => {}),
      dispose: vi.fn(async () => {}),
    };
    const lifecycle = new ViteAdapterLifecycle(
      acquireOutputLease(`newer-failure-${Date.now()}`, root),
    );
    lifecycle.attachServer(server, source);
    lifecycle.attachSession(session as never);
    const observer = lifecycle.observer(() => configuration(root, 'assets'));
    observer({ kind: 'started', generation: 2, changes: [] });
    observer({
      kind: 'result',
      result: {
        ...successResult(root, 'assets'),
        generation: 2,
        watchInputs: inputs([path.join(root, 'new-obligation')]),
      },
    });
    await lifecycle.settled();
    expect(lifecycle.failure?.message).toContain('regeneration failed');
    expect(session.reconcileInputs).toHaveBeenCalledExactlyOnceWith([
      path.join(root, 'new-obligation'),
    ]);
    expect(session.rescan).not.toHaveBeenCalled();
    await lifecycle.dispose();
  });

  it('publishes current results, reports severities, reconciles registrations and joins owners', async () => {
    const root = await directory();
    const watcher = new FakeWatcher();
    const source = new ViteFileEventSource(watcher as unknown as FSWatcher, 10);
    const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn() };
    const server = { config: { logger }, ws: { send: vi.fn() } } as unknown as ViteDevServer;
    const newest = { ...successResult(root, 'assets'), generation: 3 };
    newest.manifest.files = [];
    const reobserved = vi.fn<(paths: readonly string[]) => Promise<void>>(async () => {
      observer({ kind: 'started', generation: 3, changes: [] });
      observer({ kind: 'result', result: newest });
    });
    const session = {
      reconcileInputs: reobserved,
      rescan: vi.fn(async () => {}),
      dispose: vi.fn(async () => {}),
    };
    const watch = {
      initial: Promise.resolve(result('cancelled', 1)),
      dispose: vi.fn(async () => {}),
    };
    const lifecycle = new ViteAdapterLifecycle(acquireOutputLease(`events-${Date.now()}`, root));
    lifecycle.attachServer(server, source);
    lifecycle.attachSession(session as never);
    lifecycle.attachWatch(watch);
    lifecycle.publish(successResult(root, 'assets'), configuration(root, 'assets'));
    const observer = lifecycle.observer(() => configuration(root, 'assets'));
    observer({ kind: 'started', generation: 2, changes: [] });
    const published = {
      ...successResult(root, 'assets'),
      generation: 2,
      watchInputs: inputs([path.join(root, 'new.md')]),
    };
    observer({ kind: 'result', result: published });
    await lifecycle.settled();
    expect(lifecycle.configuration).toEqual(configuration(root, 'assets'));
    expect(reobserved).toHaveBeenCalledWith([path.join(root, 'new.md')]);
    expect(session.rescan).not.toHaveBeenCalled();
    expect(lifecycle.assets.size()).toBe(0);
    expect(server.ws.send).toHaveBeenCalledOnce();

    observer({
      kind: 'diagnostic',
      diagnostic: { code: 'WARN', message: 'warning', severity: 'warning', stage: 'host' },
    });
    observer({
      kind: 'diagnostic',
      diagnostic: { code: 'INFO', message: 'information', severity: 'info', stage: 'host' },
    });
    observer({
      kind: 'diagnostic',
      diagnostic: { code: 'FATAL', message: 'fatal', severity: 'error', stage: 'host' },
    });
    expect(logger.warn).toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalled();
    expect(lifecycle.failure?.message).toContain('FATAL');

    observer({ kind: 'started', generation: 4, changes: [] });
    observer({ kind: 'result', result: result('failure', 4) });
    await lifecycle.settled();
    expect(lifecycle.failure?.message).toContain('regeneration failed');
    observer({ kind: 'started', generation: 5, changes: [] });
    observer({ kind: 'result', result: { ...published, generation: 5 } });
    await lifecycle.settled();
    expect(lifecycle.failure).toBeUndefined();

    await lifecycle.dispose();
    await lifecycle.dispose();
    expect(watch.dispose).toHaveBeenCalledOnce();
    expect(session.dispose).toHaveBeenCalledOnce();
    expect(() => lifecycle.attachSession(session as never)).toThrow('disposed');
    expect(() => lifecycle.attachServer(server, source)).toThrow('disposed');
    expect(() => lifecycle.attachWatch(watch)).toThrow('disposed');
  });

  it('reloads a changed manifest only after host coordination permits publication', async () => {
    const root = await directory();
    const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn() };
    const send = vi.fn();
    const server = { config: { logger }, ws: { send } } as unknown as ViteDevServer;
    const lifecycle = new ViteAdapterLifecycle(acquireOutputLease(`reloads-${Date.now()}`, root));
    const config = configuration(root, 'assets');
    lifecycle.attachServer(
      server,
      new ViteFileEventSource(new FakeWatcher() as unknown as FSWatcher, 10),
    );
    lifecycle.publish(successResult(root, 'assets'), config);
    const observer = lifecycle.observer(() => config);
    const changed = {
      ...successResult(root, 'assets'),
      generation: 2,
      manifest: { ...successResult(root, 'assets').manifest, files: [] },
    };
    observer({ kind: 'started', generation: 2, changes: [] });
    observer({ kind: 'result', result: changed });
    await lifecycle.settled();
    expect(send).toHaveBeenCalledOnce();
    await lifecycle.dispose();
  });

  it('releases the hot update of an unchanged save that the session discards', async () => {
    const root = await directory();
    const docs = path.join(root, 'docs');
    const output = path.join(root, 'out');
    await mkdir(docs, { recursive: true });
    await mkdir(output, { recursive: true });
    const page = path.join(docs, 'page.md');
    await writeFile(page, 'v1');
    const compile = vi.fn(async (request: { generation: number }) => {
      const body = await readFile(page, 'utf8');
      return {
        candidate: {
          ...successResult(output, 'assets').snapshot,
          revision: `${request.generation}:${body}`,
        },
        dependencies: [
          {
            kind: 'content' as const,
            path: page,
            digest: createHash('sha256').update(body).digest('hex'),
          },
        ],
        diagnostics: [],
        whyRebuilt: [],
      };
    });
    const session = createBuildSession(
      {
        compiler: { compile, dispose: async () => {} },
        committer: {
          commit: async (request) => ({
            status: 'committed',
            manifest: {
              ...successResult(output, 'assets').manifest,
              generation: request.generation,
              revision: request.candidate.revision,
            },
            written: [],
            removed: [],
            diagnostics: [],
          }),
          dispose: async () => {},
        },
      },
      { batchDelayMs: 0 },
    );
    const source = new ViteFileEventSource(new FakeWatcher() as unknown as FSWatcher, 10);
    source.excludeOwned(output);
    const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn() };
    const server = { config: { logger }, ws: { send: vi.fn() } } as unknown as ViteDevServer;
    const lifecycle = new ViteAdapterLifecycle(
      acquireOutputLease(`unchanged-${Date.now()}`, output),
    );
    lifecycle.attachServer(server, source);
    lifecycle.attachSession(session);
    const built = await session.buildOnce({ mode: 'development' });
    expect(built.status).toBe('success');
    await source.seed(built.generation, built.watchInputs);
    const watch = await session.watch(
      source,
      lifecycle.observer(() => configuration(output, 'assets')),
    );
    lifecycle.attachWatch(watch);
    expect(await watch.initial).toEqual(built);
    const settled = (promise: Promise<unknown>) =>
      Promise.race([
        promise.then(() => 'settled'),
        new Promise((resolve) => setTimeout(() => resolve('pending'), 500)),
      ]);
    // An identical save of a recorded input: no generation claims it, so it must not wait forever.
    const unchanged = lifecycle.hostUpdateStarted(page, 'update', () => 'v1');
    expect(await settled(unchanged.ready)).toBe('settled');
    expect(await settled(lifecycle.hostUpdateAcknowledged(unchanged))).toBe('settled');
    expect(compile).toHaveBeenCalledTimes(1);
    // A real edit is claimed by the generation that lists it.
    await writeFile(page, 'v2');
    const edited = lifecycle.hostUpdateStarted(page, 'update', () => 'v2');
    expect(await settled(edited.ready)).toBe('settled');
    await vi.waitFor(() => expect(compile).toHaveBeenCalledTimes(2));
    expect(compile.mock.calls[1][0]).toMatchObject({ changes: [{ kind: 'update', path: page }] });
    await lifecycle.settled();
    await lifecycle.dispose();
  });

  it('regenerates an identical re-save after the host failed to publish a committed generation', async () => {
    const root = await directory();
    const docs = path.join(root, 'docs');
    const output = path.join(root, 'out');
    await mkdir(docs, { recursive: true });
    await mkdir(output, { recursive: true });
    const page = path.join(docs, 'page.md');
    await writeFile(page, 'v1');
    const compile = vi.fn(async (request: { generation: number }) => {
      const body = await readFile(page, 'utf8');
      return {
        candidate: {
          ...successResult(output, 'assets').snapshot,
          revision: `${request.generation}:${body}`,
        },
        dependencies: [
          {
            kind: 'content' as const,
            path: page,
            digest: createHash('sha256').update(body).digest('hex'),
          },
        ],
        diagnostics: [],
        whyRebuilt: [],
      };
    });
    const session = createBuildSession(
      {
        compiler: { compile, dispose: async () => {} },
        committer: {
          commit: async (request) => ({
            status: 'committed',
            manifest: {
              ...successResult(output, 'assets').manifest,
              generation: request.generation,
              revision: request.candidate.revision,
            },
            written: [],
            removed: [],
            diagnostics: [],
          }),
          dispose: async () => {},
        },
      },
      { batchDelayMs: 0 },
    );
    const source = new ViteFileEventSource(new FakeWatcher() as unknown as FSWatcher, 10);
    source.excludeOwned(output);
    const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn() };
    const server = { config: { logger }, ws: { send: vi.fn() } } as unknown as ViteDevServer;
    const lifecycle = new ViteAdapterLifecycle(
      acquireOutputLease(`publication-failed-${Date.now()}`, output),
    );
    lifecycle.attachServer(server, source);
    lifecycle.attachSession(session);
    const built = await session.buildOnce({ mode: 'development' });
    await source.seed(built.generation, built.watchInputs);
    // Generation 2 commits in the session, but the host cannot publish it (no configuration).
    let publishable = false;
    const watch = await session.watch(
      source,
      lifecycle.observer(() => (publishable ? configuration(output, 'assets') : undefined)),
    );
    lifecycle.attachWatch(watch);
    await watch.initial;
    await writeFile(page, 'v2');
    lifecycle.hostUpdateStarted(page, 'update', () => 'v2');
    await vi.waitFor(() => expect(compile).toHaveBeenCalledTimes(2));
    await lifecycle.settled();
    expect(lifecycle.failure?.message).toContain('NGDOC_VITE_CONFIGURATION');
    // Re-saving the same bytes retries the publication instead of being discarded.
    publishable = true;
    lifecycle.hostUpdateStarted(page, 'update', () => 'v2');
    await vi.waitFor(() => expect(compile).toHaveBeenCalledTimes(3));
    await lifecycle.settled();
    expect(lifecycle.failure).toBeUndefined();
    await lifecycle.dispose();
  });

  it('keeps a compiler restart failure visible across later generator publication', async () => {
    const root = await directory();
    const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn() };
    const send = vi.fn();
    const server = { config: { logger }, ws: { send } } as unknown as ViteDevServer;
    const lifecycle = new ViteAdapterLifecycle(acquireOutputLease(`poisoned-${Date.now()}`, root));
    lifecycle.attachServer(
      server,
      new ViteFileEventSource(new FakeWatcher() as unknown as FSWatcher, 10),
    );
    const config = configuration(root, 'assets');
    lifecycle.publish(successResult(root, 'assets'), config);
    lifecycle.hostUpdateFailed(
      new Error('[NGDOC_VITE_ANGULAR_RESTART_REQUIRED] Recreate the Angular compiler.'),
    );
    const poisoned = lifecycle.failure;
    lifecycle.publish({ ...successResult(root, 'assets'), generation: 2 }, config);
    expect(lifecycle.failure).toBe(poisoned);
    expect(lifecycle.failure?.message).toContain('ANGULAR_RESTART_REQUIRED');
    await lifecycle.dispose();
  });

  it('preserves independent generator failures while only a real compiler acknowledgement repairs diagnostics', async () => {
    const root = await directory();
    const lifecycle = new ViteAdapterLifecycle(
      acquireOutputLease(`diagnostic-${Date.now()}`, root),
    );
    const config = configuration(root, 'assets');
    lifecycle.publish(successResult(root, 'assets'), config);
    const observe = lifecycle.observer(() => config);
    observe({
      kind: 'diagnostic',
      diagnostic: {
        code: 'GENERATION',
        message: 'generator failed',
        severity: 'error',
        stage: 'host',
      },
    });
    const generatorError = lifecycle.failure;
    const failed = lifecycle.hostUpdateStarted(
      path.join(root, '../broken.ts'),
      'update',
      () => 'bad',
    );
    const diagnostic = new Error('compiler diagnostic');
    lifecycle.hostUpdateDiagnostic(failed, diagnostic);
    const repaired = lifecycle.hostUpdateStarted(
      path.join(root, '../repair.ts'),
      'update',
      () => 'good',
    );
    await lifecycle.hostUpdateAcknowledged(repaired, false, true);
    expect(lifecycle.failure).toBe(generatorError);
    const failedAgain = lifecycle.hostUpdateStarted(
      path.join(root, '../broken.ts'),
      'update',
      () => 'bad',
    );
    lifecycle.hostUpdateDiagnostic(failedAgain, diagnostic);
    lifecycle.publish({ ...successResult(root, 'assets'), generation: 2 }, config);
    expect(lifecycle.failure).toBe(diagnostic);
    const plain = lifecycle.hostUpdateStarted(
      path.join(root, '../README.md'),
      'update',
      () => 'plain',
    );
    await lifecycle.hostUpdateAcknowledged(plain);
    expect(lifecycle.failure).toBe(diagnostic);
    const valid = lifecycle.hostUpdateStarted(
      path.join(root, '../repair.ts'),
      'update',
      () => 'good',
    );
    await lifecycle.hostUpdateAcknowledged(valid, false, true);
    expect(lifecycle.failure).toBeUndefined();
    await lifecycle.dispose();
  });

  it('holds failed compiler tickets through publication and plain posts, then repairs without early reload', async () => {
    const root = await directory();
    const notify = vi.fn();
    const coordinator = new HostUpdateCoordinator(notify, vi.fn());
    const stable = outputManifest([]);
    coordinator.seed(root, stable);
    const failed = coordinator.begin(
      path.join(root, '../broken.ts'),
      'update',
      async () => 'bad',
      false,
    );
    const diagnostic = new Error('invalid component');
    coordinator.diagnostic(failed, diagnostic);
    coordinator.started(2, []);
    const success = successWithManifest(2, stable);
    coordinator.result(success);
    coordinator.published(success, true);
    expect(notify).not.toHaveBeenCalled();
    await expect(coordinator.settle(failed)).rejects.toBe(diagnostic);
    const plain = coordinator.begin(
      path.join(root, '../readme.md'),
      'update',
      async () => '',
      false,
    );
    await coordinator.acknowledge(plain);
    expect(coordinator.diagnosticError()).toBe(diagnostic);
    const repaired = coordinator.begin(
      path.join(root, '../valid.ts'),
      'update',
      async () => '',
      false,
    );
    await coordinator.acknowledge(repaired, false, true);
    await coordinator.settle(repaired);
    expect(coordinator.diagnosticError()).toBeUndefined();
    expect(coordinator.blockerCount()).toBe(0);
    expect(notify).toHaveBeenCalled();
    coordinator.dispose();
  });

  it('does not let an older successful compiler hook clear a newer diagnostic', async () => {
    const root = await directory();
    const coordinator = new HostUpdateCoordinator(vi.fn(), vi.fn());
    coordinator.seed(root, outputManifest([]));
    const older = coordinator.begin(
      path.join(root, '../older.ts'),
      'update',
      async () => '',
      false,
    );
    const newer = coordinator.begin(
      path.join(root, '../newer.ts'),
      'update',
      async () => '',
      false,
    );
    const diagnostic = new Error('newer failure');
    coordinator.diagnostic(newer, diagnostic);
    await coordinator.acknowledge(older, false, true);
    expect(coordinator.diagnosticError()).toBe(diagnostic);
    coordinator.dispose();
    expect(coordinator.diagnosticError()).toBeUndefined();
  });

  it('interrupts an existing publication wait with a recoverable diagnostic instead of a host timeout', async () => {
    const root = await directory();
    const fail = vi.fn();
    const coordinator = new HostUpdateCoordinator(vi.fn(), fail);
    coordinator.seed(root, outputManifest([]));
    const source = path.join(root, '../source.ts');
    const ticket = coordinator.begin(source, 'update', async () => '', true);
    coordinator.started(2, [{ kind: 'update', path: source }]);
    await ticket.ready;
    const waiting = coordinator.settle(ticket);
    const diagnostic = new Error('diagnosed candidate');
    const assertion = expect(waiting).rejects.toBe(diagnostic);
    coordinator.diagnostic(ticket, diagnostic);
    await assertion;
    expect(fail).not.toHaveBeenCalled();
    coordinator.dispose();
  });

  it('keeps unrelated native obligations when a diagnostic is raised and repaired during a wait', async () => {
    const root = await directory();
    const coordinator = new HostUpdateCoordinator(vi.fn(), vi.fn());
    const stable = outputManifest([]);
    coordinator.seed(root, stable);
    const heldPath = path.join(root, '../held.ts');
    const held = coordinator.begin(heldPath, 'update', async () => '', true);
    coordinator.started(2, [{ kind: 'update', path: heldPath }]);
    const success = successWithManifest(2, stable);
    coordinator.result(success);
    coordinator.published(success, false);
    await held.ready;
    const waitingTicket = coordinator.begin(
      path.join(root, '../plain.md'),
      'update',
      async () => '',
      false,
    );
    let settled = false;
    const waiting = coordinator.settle(waitingTicket).then(() => {
      settled = true;
    });
    await Promise.resolve();
    const failed = coordinator.begin(
      path.join(root, '../broken.ts'),
      'update',
      async () => '',
      false,
    );
    coordinator.diagnostic(failed, new Error('temporary diagnostic'));
    const repaired = coordinator.begin(
      path.join(root, '../repair.ts'),
      'update',
      async () => '',
      false,
    );
    await coordinator.acknowledge(repaired, false, true);
    await new Promise((resolve) => setImmediate(resolve));
    expect(settled).toBe(false);
    expect(coordinator.blockerCount()).toBe(1);
    await coordinator.acknowledge(held, false, true);
    await waiting;
    coordinator.dispose();
  });

  it('supersedes only diagnosed generated-output obligations after a later validated compiler pass', async () => {
    const root = await directory();
    const file = path.join(root, 'routes.ts');
    await writeFile(file, 'old');
    const notify = vi.fn();
    const coordinator = new HostUpdateCoordinator(notify, vi.fn());
    coordinator.seed(root, outputManifest([['routes.ts', digest('old'), 'routes']]));
    coordinator.started(2, []);
    await writeFile(file, 'new');
    const manifest = outputManifest([['routes.ts', digest('new'), 'routes']]);
    const resultValue = successWithManifest(2, manifest);
    coordinator.result(resultValue);
    const failed = coordinator.begin(file, 'update', () => readFile(file, 'utf8'), false);
    await failed.ready;
    coordinator.diagnostic(failed, new Error('source diagnostic during generated compilation'));
    coordinator.published(resultValue, false);
    expect(notify).not.toHaveBeenCalled();
    const repaired = coordinator.begin(
      path.join(root, '../app.ts'),
      'update',
      async () => '',
      false,
    );
    await coordinator.acknowledge(repaired, false, true);
    await coordinator.settle(repaired);
    expect(coordinator.blockerCount()).toBe(0);
    expect(coordinator.diagnosticError()).toBeUndefined();
    coordinator.dispose();
  });

  it('acknowledges physical content modules without clearing Angular shape obligations', async () => {
    const root = await directory();
    const data = path.join(root, 'page.content.mjs');
    const page = path.join(root, 'page.ts');
    const notify = vi.fn();
    const coordinator = new HostUpdateCoordinator(notify, vi.fn());
    await writeFile(data, 'old');
    coordinator.seed(root, outputManifest([['page.content.mjs', digest('old'), 'content']]));
    coordinator.started(2, []);
    await writeFile(data, 'new');
    await writeFile(page, 'page');
    const value = successWithManifest(
      2,
      outputManifest([
        ['page.content.mjs', digest('new'), 'content'],
        ['page.ts', digest('page'), 'angular'],
      ]),
    );
    coordinator.result(value);
    const update = coordinator.begin(data, 'update', () => readFile(data, 'utf8'), false);
    const create = coordinator.begin(page, 'create', () => readFile(page, 'utf8'), false);
    await Promise.all([update.ready, create.ready]);
    coordinator.published(value, false);
    await coordinator.acknowledge(update);
    expect(coordinator.blockerCount()).toBe(1);
    expect(notify).not.toHaveBeenCalled();
    coordinator.dispose();
  });

  it('waits for physical content ticket matching when the host acknowledges immediately', async () => {
    const root = await directory();
    const file = path.join(root, 'page.content.mjs');
    const coordinator = new HostUpdateCoordinator(vi.fn(), vi.fn());
    await writeFile(file, 'old');
    coordinator.seed(root, outputManifest([['page.content.mjs', digest('old'), 'content']]));
    coordinator.started(2, []);
    await writeFile(file, 'new');
    const value = successWithManifest(
      2,
      outputManifest([['page.content.mjs', digest('new'), 'content']]),
    );
    coordinator.result(value);
    const ticket = coordinator.begin(file, 'update', () => readFile(file, 'utf8'), false);
    // The non-compiler Angular hook can return before asynchronous file matching finishes.
    await coordinator.acknowledge(ticket);
    expect(coordinator.blockerCount()).toBe(0);
    coordinator.dispose();
  });

  it('publishes data-only updates, additions and deletions after their own host acknowledgments', async () => {
    const root = await directory();
    const file = path.join(root, 'page.content.mjs');
    const notify = vi.fn();
    const coordinator = new HostUpdateCoordinator(notify, vi.fn());
    coordinator.seed(root, outputManifest([]));
    for (const [offset, type] of (['create', 'update', 'delete'] as const).entries()) {
      const generation = offset + 2;
      coordinator.started(generation, []);
      if (type === 'delete') await rm(file);
      else await writeFile(file, type);
      const value = successWithManifest(
        generation,
        outputManifest(type === 'delete' ? [] : [['page.content.mjs', digest(type), 'content']]),
      );
      coordinator.result(value);
      const ticket = coordinator.begin(file, type, () => readFile(file, 'utf8'), false);
      await ticket.ready;
      coordinator.published(value, false);
      expect(coordinator.blockerCount()).toBe(1);
      await coordinator.acknowledge(ticket);
      expect(coordinator.blockerCount()).toBe(0);
      await coordinator.settle(ticket);
      expect(notify).toHaveBeenCalledTimes(offset + 1);
    }
    coordinator.dispose();
  });

  it('waits for every generated TypeScript post and retains older work before asset reload', async () => {
    const root = await directory();
    const route = path.join(root, 'routes.ts');
    const context = path.join(root, 'context.ts');
    const notify = vi.fn();
    const fail = vi.fn();
    const coordinator = new HostUpdateCoordinator(notify, fail);
    const initial = outputManifest([
      ['routes.ts', 'route-a', 'routes'],
      ['context.ts', 'context-a', 'context'],
      ['assets/indexes.json', 'asset-a', 'search'],
    ]);
    coordinator.seed(root, initial);
    coordinator.started(2, []);
    await writeFile(route, 'route-b');
    await writeFile(context, 'context-b');
    const routeUpdate = coordinator.begin(route, 'update', async () => 'route-b', false);
    const contextUpdate = coordinator.begin(context, 'update', async () => 'context-b', false);
    const modules = outputManifest([
      ['routes.ts', digest('route-b'), 'routes'],
      ['context.ts', digest('context-b'), 'context'],
      ['assets/indexes.json', 'asset-a', 'search'],
    ]);
    coordinator.result(successWithManifest(2, modules));
    await Promise.all([routeUpdate.ready, contextUpdate.ready]);
    coordinator.published(successWithManifest(2, modules), false);
    let firstSettled = false;
    const first = coordinator.complete(routeUpdate).then(() => {
      firstSettled = true;
    });
    await Promise.resolve();
    expect(firstSettled).toBe(false);

    coordinator.started(3, []);
    const assets = outputManifest([
      ['routes.ts', digest('route-b'), 'routes'],
      ['context.ts', digest('context-b'), 'context'],
      ['assets/indexes.json', 'asset-b', 'search'],
    ]);
    coordinator.result(successWithManifest(3, assets));
    coordinator.published(successWithManifest(3, assets), false);
    expect(coordinator.blockerCount()).toBeGreaterThan(0);
    coordinator.started(4, []);
    coordinator.result(successWithManifest(4, assets));
    coordinator.published(successWithManifest(4, assets), false);
    expect(notify).not.toHaveBeenCalled();
    await coordinator.complete(contextUpdate);
    await first;
    expect(coordinator.blockerCount()).toBe(0);
    expect(notify).toHaveBeenCalledOnce();
    expect(fail).not.toHaveBeenCalled();
    coordinator.dispose();
  });

  it('orders shape observation before updates and fails closed without a TypeScript witness', async () => {
    const root = await directory();
    const notify = vi.fn();
    const coordinator = new HostUpdateCoordinator(notify, vi.fn());
    coordinator.seed(root, outputManifest([['routes.ts', 'route-a', 'routes']]));
    coordinator.started(2, []);
    await writeFile(path.join(root, 'routes.ts'), 'route-b');
    await writeFile(path.join(root, 'page.ts'), 'page');
    const routeUpdate = coordinator.begin(
      path.join(root, 'routes.ts'),
      'update',
      async () => 'route-b',
      false,
    );
    const pageCreate = coordinator.begin(
      path.join(root, 'page.ts'),
      'create',
      async () => 'page',
      false,
    );
    const shaped = outputManifest([
      ['routes.ts', digest('route-b'), 'routes'],
      ['page.ts', digest('page'), 'angular'],
    ]);
    coordinator.result(successWithManifest(2, shaped));
    coordinator.published(successWithManifest(2, shaped), false);
    await Promise.all([routeUpdate.ready, pageCreate.ready]);
    const pageCompletion = coordinator.complete(pageCreate);
    await Promise.resolve();
    expect(coordinator.blockerCount()).toBe(2);
    await coordinator.complete(routeUpdate);
    await pageCompletion;
    expect(coordinator.blockerCount()).toBe(0);
    notify.mockClear();

    coordinator.started(3, []);
    await writeFile(path.join(root, 'orphan.ts'), 'orphan');
    const orphanCreate = coordinator.begin(
      path.join(root, 'orphan.ts'),
      'create',
      async () => 'orphan',
      false,
    );
    const shapeOnly = outputManifest([
      ['routes.ts', digest('route-b'), 'routes'],
      ['page.ts', digest('page'), 'angular'],
      ['orphan.ts', digest('orphan'), 'angular'],
    ]);
    coordinator.result(successWithManifest(3, shapeOnly));
    coordinator.published(successWithManifest(3, shapeOnly), false);
    await orphanCreate.ready;
    let shapeSettled = false;
    const shapeCompletion = coordinator.complete(orphanCreate).then(() => {
      shapeSettled = true;
    });
    await Promise.resolve();
    expect(shapeSettled).toBe(false);
    expect(coordinator.blockerCount()).toBe(1);
    expect(notify).not.toHaveBeenCalled();
    coordinator.dispose();
    await shapeCompletion;
  });

  it('pairs source completion across result order and reloads identical recovery only when clear', async () => {
    const root = await directory();
    const notify = vi.fn();
    const coordinator = new HostUpdateCoordinator(notify, vi.fn());
    const stable = outputManifest([['routes.ts', 'stable', 'routes']]);
    coordinator.seed(root, stable);
    const config = path.join(root, '../ng-doc.config.ts');

    const failedEvent = coordinator.begin(config, 'update', async () => 'broken', true);
    coordinator.started(2, [{ kind: 'update', path: config }]);
    await failedEvent.ready;
    const failedPost = coordinator.complete(failedEvent);
    await Promise.resolve();
    coordinator.result(result('failure', 2));
    coordinator.publication(2, 'failure', new Error('generation failed'));
    await expect(failedPost).rejects.toThrow('generation failed');

    const repairedEvent = coordinator.begin(config, 'update', async () => 'valid', true);
    coordinator.started(3, [{ kind: 'update', path: config }]);
    const recovered = successWithManifest(3, stable);
    coordinator.result(recovered);
    await repairedEvent.ready;
    const repairedPost = coordinator.complete(repairedEvent);
    coordinator.published(recovered, true);
    await repairedPost;
    expect(notify).toHaveBeenCalledOnce();
    expect(coordinator.blockerCount()).toBe(0);
    coordinator.dispose();
  });

  it('holds a relevant resource witness until its generator candidate commits', async () => {
    const root = await directory();
    const resource = path.join(root, '../src/app.component.html');
    const notify = vi.fn();
    const coordinator = new HostUpdateCoordinator(notify, vi.fn());
    const stable = outputManifest([['routes.ts', 'stable', 'routes']]);
    coordinator.seed(root, stable);
    const ticket = coordinator.begin(resource, 'update', async () => 'changed', true);
    coordinator.started(2, [{ kind: 'update', path: resource }]);
    let committed = false;
    const commit = coordinator.committed(ticket).then(() => {
      committed = true;
    });
    await Promise.resolve();
    expect(committed).toBe(false);
    const success = successWithManifest(2, stable);
    coordinator.result(success);
    await commit;
    expect(committed).toBe(true);
    await coordinator.acknowledge(ticket, true);
    coordinator.published(success, false);
    await coordinator.settle(ticket);
    expect(coordinator.blockerCount()).toBe(0);
    expect(notify).toHaveBeenCalledOnce();

    const failed = coordinator.begin(resource, 'update', async () => 'broken', true);
    coordinator.started(3, [{ kind: 'update', path: resource }]);
    const failedCommit = coordinator.committed(failed);
    coordinator.result(result('failure', 3));
    await expect(failedCommit).resolves.toBeUndefined();
    await coordinator.acknowledge(failed, true);
    coordinator.publication(3, 'failure', new Error('failed'));
    coordinator.dispose();
  });

  it('releases a failed resource candidate before a cross-file repair', async () => {
    const root = await directory();
    const resource = path.join(root, '../src/app.component.html');
    const configFile = path.join(root, '../ng-doc.config.ts');
    const notify = vi.fn();
    const coordinator = new HostUpdateCoordinator(notify, vi.fn());
    const stable = outputManifest([['routes.ts', 'stable', 'routes']]);
    coordinator.seed(root, stable);

    const failedResource = coordinator.begin(resource, 'update', async () => 'broken', true);
    coordinator.started(2, [{ kind: 'update', path: resource }]);
    const failedCommit = coordinator.committed(failedResource);
    coordinator.result(result('failure', 2));
    await expect(failedCommit).resolves.toBeUndefined();
    // The failed candidate kept the prior tree atomically available. The actual Angular resource
    // hook and its fresh component probe acknowledge this ticket before publication fails.
    await coordinator.acknowledge(failedResource, true);
    coordinator.publication(2, 'failure', new Error('resource generation failed'));

    const repairedConfig = coordinator.begin(configFile, 'update', async () => 'valid', true);
    coordinator.started(3, [{ kind: 'update', path: configFile }]);
    await repairedConfig.ready;
    const repairedPost = coordinator.complete(repairedConfig);
    const repaired = successWithManifest(3, stable);
    coordinator.result(repaired);
    coordinator.published(repaired, true);
    await repairedPost;
    expect(coordinator.blockerCount()).toBe(0);
    expect(notify).toHaveBeenCalledOnce();
    coordinator.dispose();
  });

  it('reloads a completed application TypeScript update without inventing a generator result', async () => {
    const root = await directory();
    const notify = vi.fn();
    const coordinator = new HostUpdateCoordinator(notify, vi.fn());
    const stable = outputManifest([['routes.ts', digest('stable'), 'routes']]);
    coordinator.seed(root, stable);
    const application = coordinator.begin(
      path.join(root, '../src/main.ts'),
      'update',
      async () => 'application-b',
      false,
    );
    await application.ready;
    await coordinator.complete(application);
    expect(notify).toHaveBeenCalledOnce();
    expect(coordinator.blockerCount()).toBe(0);
    coordinator.dispose();
  });

  it('does not let an application reload pass an unpublished generator generation', async () => {
    const root = await directory();
    const markdown = path.join(root, '../docs/guide.md');
    const route = path.join(root, 'routes.ts');
    const notify = vi.fn();
    const coordinator = new HostUpdateCoordinator(notify, vi.fn());
    const first = outputManifest([['routes.ts', digest('route-a'), 'routes']]);
    coordinator.seed(root, first);

    const markdownUpdate = coordinator.begin(markdown, 'update', async () => 'markdown-b', true);
    coordinator.started(2, [{ kind: 'update', path: markdown }]);
    await markdownUpdate.ready;
    const markdownPost = coordinator.complete(markdownUpdate);

    const application = coordinator.begin(
      path.join(root, '../src/main.ts'),
      'update',
      async () => 'application-b',
      false,
    );
    let applicationSettled = false;
    const applicationPost = coordinator.complete(application).then(() => {
      applicationSettled = true;
    });
    await Promise.resolve();
    expect(applicationSettled).toBe(false);
    expect(notify).not.toHaveBeenCalled();

    await writeFile(route, 'route-b');
    const routeUpdate = coordinator.begin(route, 'update', async () => 'route-b', false);
    const second = outputManifest([['routes.ts', digest('route-b'), 'routes']]);
    coordinator.result(successWithManifest(2, second));
    coordinator.published(successWithManifest(2, second), false);
    await routeUpdate.ready;
    expect(notify).not.toHaveBeenCalled();
    await coordinator.complete(routeUpdate);
    await Promise.all([markdownPost, applicationPost]);
    expect(notify).toHaveBeenCalledOnce();
    coordinator.dispose();
  });

  it('announces a skipped committed asset change through the next current no-op success', () => {
    const root = path.resolve('/tmp/ng-doc-vite-skipped-publication');
    const notify = vi.fn();
    const coordinator = new HostUpdateCoordinator(notify, vi.fn());
    const first = outputManifest([['assets/indexes.json', 'asset-a', 'search']]);
    const second = outputManifest([['assets/indexes.json', 'asset-b', 'search']]);
    coordinator.seed(root, first);
    coordinator.started(2, []);
    coordinator.result(successWithManifest(2, second));
    // Lifecycle currentness rejects generation 2 after its candidate was committed but before
    // publish() could announce it.
    coordinator.started(3, []);
    coordinator.result(successWithManifest(3, second));
    coordinator.published(successWithManifest(3, second), false);
    expect(notify).toHaveBeenCalledOnce();
    coordinator.dispose();
  });

  it('retains a claimed TypeScript reload when its successful publication is skipped', async () => {
    const root = path.resolve('/tmp/ng-doc-vite-skipped-source-publication');
    const config = path.join(root, '../ng-doc.config.ts');
    const notify = vi.fn();
    const coordinator = new HostUpdateCoordinator(notify, vi.fn());
    const stable = outputManifest([['routes.ts', digest('stable'), 'routes']]);
    coordinator.seed(root, stable);
    const source = coordinator.begin(config, 'update', async () => 'updated', true);
    coordinator.started(2, [{ kind: 'update', path: config }]);
    await source.ready;
    const sourcePost = coordinator.complete(source);
    coordinator.result(successWithManifest(2, stable));

    coordinator.started(3, []);
    coordinator.publication(2, 'skipped');
    coordinator.result(successWithManifest(3, stable));
    coordinator.published(successWithManifest(3, stable), false);
    await sourcePost;
    expect(notify).toHaveBeenCalledOnce();
    coordinator.dispose();
  });

  it('pairs concurrent same-path tickets exactly and rejects an ABA observation from an older epoch', async () => {
    const root = await directory();
    const route = path.join(root, 'routes.ts');
    const coordinator = new HostUpdateCoordinator(vi.fn(), vi.fn());
    coordinator.seed(root, outputManifest([['routes.ts', digest('route-a'), 'routes']]));

    coordinator.started(2, []);
    await writeFile(route, 'route-b');
    const versionB = coordinator.begin(route, 'update', async () => 'route-b', false);
    const manifestB = outputManifest([['routes.ts', digest('route-b'), 'routes']]);
    coordinator.result(successWithManifest(2, manifestB));
    coordinator.publication(2, 'success');
    await versionB.ready;

    coordinator.started(3, []);
    const delayedB = coordinator.begin(route, 'update', async () => 'route-b', false);
    await delayedB.ready;
    await writeFile(route, 'route-a');
    const versionA = coordinator.begin(route, 'update', async () => 'route-a', false);
    const manifestA = outputManifest([['routes.ts', digest('route-a'), 'routes']]);
    coordinator.result(successWithManifest(3, manifestA));
    coordinator.publication(3, 'success');
    await versionA.ready;

    let delayedSettled = false;
    const delayedPost = coordinator.complete(delayedB).then(() => {
      delayedSettled = true;
    });
    await Promise.resolve();
    expect(delayedSettled).toBe(false);
    await coordinator.complete(versionA);
    await delayedPost;
    await coordinator.complete(versionB);
    expect(coordinator.blockerCount()).toBe(0);
    coordinator.dispose();
  });

  it('does not accept create as a TypeScript update completion and releases waits on disposal', async () => {
    const root = await directory();
    const route = path.join(root, 'routes.ts');
    const coordinator = new HostUpdateCoordinator(vi.fn(), vi.fn());
    coordinator.seed(root, outputManifest([['routes.ts', digest('route-a'), 'routes']]));
    coordinator.started(2, []);
    await writeFile(route, 'route-b');
    const wrongShape = coordinator.begin(route, 'create', async () => 'route-b', false);
    const manifest = outputManifest([['routes.ts', digest('route-b'), 'routes']]);
    coordinator.result(successWithManifest(2, manifest));
    coordinator.publication(2, 'success');
    await wrongShape.ready;
    const wrongCompletion = coordinator.complete(wrongShape);
    await Promise.resolve();
    expect(coordinator.blockerCount()).toBe(1);

    const waiting = coordinator.begin(path.join(root, 'later.ts'), 'update', async () => '', true);
    coordinator.dispose();
    await wrongCompletion;
    await expect(waiting.ready).rejects.toThrow('DISPOSED');
  });

  it('claims repeated same-path saves once per generation, including an overlap before result', async () => {
    const root = await directory();
    const config = path.join(root, '../ng-doc.config.ts');
    const coordinator = new HostUpdateCoordinator(vi.fn(), vi.fn());
    const stable = outputManifest([['routes.ts', 'stable', 'routes']]);
    coordinator.seed(root, stable);

    const first = coordinator.begin(config, 'update', async () => 'first', true);
    coordinator.started(2, [{ kind: 'update', path: config }]);
    await first.ready;
    const overlapping = coordinator.begin(config, 'update', async () => 'second', true);
    let overlapReady = false;
    void overlapping.ready.then(() => {
      overlapReady = true;
    });
    await Promise.resolve();
    expect(overlapReady).toBe(false);
    coordinator.result(successWithManifest(2, stable));
    coordinator.publication(2, 'success');
    await coordinator.complete(first);
    await Promise.resolve();
    expect(overlapReady).toBe(false);

    coordinator.started(3, [{ kind: 'update', path: config }]);
    await overlapping.ready;
    coordinator.result(successWithManifest(3, stable));
    coordinator.publication(3, 'success');
    await coordinator.complete(overlapping);

    const afterResult = coordinator.begin(config, 'update', async () => 'third', true);
    let nextReady = false;
    void afterResult.ready.then(() => {
      nextReady = true;
    });
    await Promise.resolve();
    expect(nextReady).toBe(false);
    coordinator.started(4, [{ kind: 'update', path: config }]);
    await afterResult.ready;
    coordinator.result(successWithManifest(4, stable));
    coordinator.publication(4, 'success');
    await coordinator.complete(afterResult);

    const coalescedFirst = coordinator.begin(config, 'update', async () => 'fourth', true);
    const coalescedSecond = coordinator.begin(config, 'update', async () => 'fifth', true);
    coordinator.started(5, [{ kind: 'update', path: config }]);
    await Promise.all([coalescedFirst.ready, coalescedSecond.ready]);
    coordinator.result(successWithManifest(5, stable));
    coordinator.publication(5, 'success');
    await Promise.all([
      coordinator.complete(coalescedSecond),
      coordinator.complete(coalescedFirst),
    ]);
    coordinator.dispose();
  });

  it('holds generated native notification until an older source compiler post is acknowledged', async () => {
    const root = await directory();
    const source = path.join(root, '../source.ts');
    const route = path.join(root, 'routes.ts');
    const coordinator = new HostUpdateCoordinator(vi.fn(), vi.fn());
    coordinator.seed(root, outputManifest([['routes.ts', digest('route-a'), 'routes']]));
    const sourceUpdate = coordinator.begin(source, 'update', async () => 'source-b', true);
    coordinator.started(2, [{ kind: 'update', path: source }]);
    await sourceUpdate.ready;

    await writeFile(route, 'route-b');
    const routeUpdate = coordinator.begin(route, 'update', async () => 'route-b', false);
    const changed = outputManifest([['routes.ts', digest('route-b'), 'routes']]);
    coordinator.result(successWithManifest(2, changed));
    coordinator.publication(2, 'success');
    await routeUpdate.ready;
    let generatedSettled = false;
    const generatedPost = coordinator.complete(routeUpdate).then(() => {
      generatedSettled = true;
    });
    await Promise.resolve();
    expect(generatedSettled).toBe(false);
    await coordinator.complete(sourceUpdate);
    await generatedPost;
    expect(generatedSettled).toBe(true);
    expect(coordinator.blockerCount()).toBe(0);
    coordinator.dispose();
  });

  it('lets a successful same-path source post supersede a failed hook with no post callback', async () => {
    const root = await directory();
    const config = path.join(root, '../ng-doc.config.ts');
    const notify = vi.fn();
    const coordinator = new HostUpdateCoordinator(notify, vi.fn());
    const stable = outputManifest([['routes.ts', digest('stable'), 'routes']]);
    coordinator.seed(root, stable);

    const broken = coordinator.begin(config, 'update', async () => 'broken', true);
    coordinator.started(2, [{ kind: 'update', path: config }]);
    coordinator.result(result('failure', 2));
    coordinator.publication(2, 'failure', new Error('generation failed'));
    await broken.ready;
    // Analog throws before the completion companion, so broken is deliberately not completed.
    expect(coordinator.blockerCount()).toBe(1);

    const repaired = coordinator.begin(config, 'update', async () => 'valid', true);
    coordinator.started(3, [{ kind: 'update', path: config }]);
    const success = successWithManifest(3, stable);
    coordinator.result(success);
    await repaired.ready;
    const completion = coordinator.complete(repaired);
    coordinator.published(success, true);
    await completion;
    expect(coordinator.blockerCount()).toBe(0);
    expect(notify).toHaveBeenCalledOnce();
    coordinator.dispose();
  });
});

describe('bounded output ownership and assets', () => {
  it('exposes deterministic hook admission, watch rejection and packaged theme transform path', async () => {
    const fixture = await project();
    const [hooks] = plugin(fixture) as Array<Record<string, any>>;
    const served = hooks.config({}, { command: 'serve' });
    expect(served.server.watch.ignored).toContain(GENERATED_STAGE_IGNORE);
    // Production source maps are the configuration's choice, as in the Angular CLI.
    expect(served).not.toHaveProperty('build');
    expect(hooks.config({}, { command: 'build' })).not.toHaveProperty('build');
    expect(() => hooks.config({ build: { watch: {} } }, { command: 'build' })).toThrow(
      'BUILD_WATCH',
    );
    expect(() => hooks.config({ server: { watch: null } }, { command: 'serve' })).toThrow(
      'WATCH_DISABLED',
    );
    expect(() => hooks.config({ server: { hmr: false } }, { command: 'serve' })).toThrow(
      'HMR_DISABLED',
    );
    expect(hooks.resolveId('unrelated')).toBeNull();
    expect(() => hooks.resolveId('@ng-doc/generated')).toThrow('ADMISSION');
    expect(
      await hooks.transformIndexHtml.handler('<html><head></head><body></body></html>'),
    ).toContain('data-ng-doc-theme-restore');
    hooks.configResolved({ command: 'build' });
    await hooks.closeBundle();
    await hooks.closeBundle();
    await expect(hooks.buildStart.handler()).rejects.toThrow('DISPOSED');
    await hooks.buildEnd(new Error('already closed'));
  });

  it('rejects duplicate identities and roots and releases idempotently', () => {
    const root = path.join(os.tmpdir(), `lease-${Date.now()}`);
    const first = acquireOutputLease('one', root);
    expect(() => acquireOutputLease('one', root)).toThrow('already active');
    expect(() => acquireOutputLease('different', root)).toThrow('Default output root');
    first.seal(root);
    const secondRoot = `${root}-two`;
    const second = acquireOutputLease('two', secondRoot);
    expect(() => second.admit(root)).toThrow('already active');
    second.dispose();
    first.dispose();
    first.dispose();
    expect(() => first.admit(root)).toThrow('disposed');
    const reused = acquireOutputLease('one', root);
    reused.seal(root);
    expect(() => reused.admit(`${root}-changed`)).toThrow('RESTART_REQUIRED');
    reused.dispose();
  });

  it('emits only manifest-owned assets and detects bundle collisions', async () => {
    const root = await directory();
    await mkdir(path.join(root, 'assets'), { recursive: true });
    await writeFile(path.join(root, 'assets/value.json'), '{"ok":true}');
    const inventory = new GeneratedAssetInventory();
    inventory.update(successResult(root, 'assets'), configuration(root, 'assets'));
    const emitted: unknown[] = [];
    await inventory.emit(
      { emitFile: (asset: unknown) => (emitted.push(asset), 'asset-id') } as never,
      {},
    );
    expect(emitted).toEqual([
      expect.objectContaining({ type: 'asset', fileName: 'assets/ng-doc/value.json' }),
    ]);
    await expect(
      inventory.emit({ emitFile: () => 'id' } as never, {
        'assets/ng-doc/value.json': {} as never,
      }),
    ).rejects.toThrow('already owns');
  });

  it('rejects unsafe asset inventories and handles malformed, stale and opaque requests', async () => {
    const root = await directory();
    await mkdir(path.join(root, 'assets'), { recursive: true });
    await writeFile(path.join(root, 'assets/value.bin'), 'opaque');
    const inventory = new GeneratedAssetInventory();
    const success = successResult(root, 'assets');
    success.manifest.files = [
      { path: 'assets/value.bin', ownerId: 'aggregate:test', digest: 'x', role: 'asset' },
    ];
    inventory.update(success, configuration(root, 'assets'));
    expect(inventory.size()).toBe(1);
    expect(await middlewareResult(inventory, '/elsewhere')).toMatchObject({ next: true });
    expect(await middlewareResult(inventory, '/assets/ng-doc/unowned.svg')).toMatchObject({
      next: true,
    });
    expect(await middlewareResult(inventory, '/assets/ng-doc/%')).toMatchObject({ status: 400 });
    expect(await middlewareResult(inventory, '/assets/ng-doc/%2e%2e%5csecret')).toMatchObject({
      status: 404,
    });
    expect(await middlewareResult(inventory, '/assets/ng-doc/value.bin')).toMatchObject({
      status: 200,
      contentType: 'application/octet-stream',
      body: Buffer.from('opaque'),
    });
    await rm(path.join(root, 'assets/value.bin'));
    expect(await middlewareResult(inventory, '/assets/ng-doc/value.bin')).toMatchObject({
      status: 404,
    });

    const unsafe = successResult(root, 'assets');
    unsafe.manifest.files = [
      { path: 'assets/../secret', ownerId: 'aggregate:test', digest: 'x', role: 'asset' },
    ];
    expect(() => inventory.update(unsafe, configuration(root, 'assets'))).toThrow(
      'Unsafe generated asset',
    );
    const duplicate = successResult(root, 'assets');
    duplicate.manifest.files.push({ ...duplicate.manifest.files[0] });
    expect(() => inventory.update(duplicate, configuration(root, 'assets'))).toThrow(
      'Duplicate generated asset',
    );
  });

  it('validates options, explicit custom themes and restart-required configuration', async () => {
    const root = await directory();
    const options = resolveOptions({
      analogLiveReload: true,
      angularPlugins: fakeAngularPlugins(path.join(root, 'app.component.ts')),
      angularComponentProbe: path.join(root, 'app.component.ts'),
      generator: {
        projectId: 'options',
        workspaceRoot: root,
        defaults: {
          docsRoot: root,
          tsConfig: path.join(root, 'tsconfig.json'),
          outputRoot: path.join(root, 'out'),
          cacheRoot: path.join(root, 'cache'),
        },
      },
      themeModules: { custom: '/src/custom-theme.ts' },
    });
    expect(staticViteConfig(options).build?.sourcemap).toBeUndefined();
    expect(staticViteConfig(options).server?.watch?.ignored).toContain(GENERATED_STAGE_IGNORE);
    expect(staticViteConfig(options).optimizeDeps?.include).toEqual(
      expect.arrayContaining(['esthetic', 'shiki/langs/angular-html.mjs']),
    );
    expect(generatedAlias(options, configuration(root, 'assets'))).toEqual(
      expect.objectContaining({ find: '@ng-doc/generated' }),
    );
    expect(themeImports(options, configuration(root, 'assets'))).toEqual([
      'shiki/themes/ayu-dark.mjs',
      'shiki/themes/github-light.mjs',
    ]);
    expect(() =>
      assertThemeModules(options, {
        ...configuration(root, 'assets'),
        themes: { light: 'custom', dark: 'unknown' },
      }),
    ).toThrow('unknown');
    // NgDoc's own theme is created by @ng-doc/app: nothing to prebundle or configure.
    const builtIn = {
      ...configuration(root, 'assets'),
      themes: { light: 'css-variables', dark: 'css-variables' },
    };
    expect(themeImports(options, builtIn)).toEqual([]);
    expect(() => assertThemeModules(options, builtIn)).not.toThrow();
    expect(() => resolveOptions({} as never)).toThrow('generator');
    const lifecycle = new ViteAdapterLifecycle(acquireOutputLease(`lifecycle-${Date.now()}`, root));
    lifecycle.publish(successResult(root, 'assets'), configuration(root, 'assets'));
    expect(() =>
      lifecycle.publish(successResult(root, 'other'), configuration(root, 'other')),
    ).toThrow('RESTART_REQUIRED');
    await lifecycle.dispose();
  });

  it('requires one supported Angular compiler and preserves hook metadata and companions', async () => {
    const root = await directory();
    const probe = path.join(root, 'app.component.ts');
    const compiler: Plugin = {
      name: '@analogjs/vite-plugin-angular',
      enforce: 'pre',
      buildStart: { order: 'pre', sequential: true, handler() {} },
      handleHotUpdate: { order: 'pre', handler: (context) => context.modules },
      transform: {
        order: 'post',
        filter: { id: /\.ts$/ },
        handler: () => ({ code: 'class App {}; App.ɵcmp = {};', map: null }),
      },
    };
    const companion: Plugin = { name: 'angular-companion', apply: 'serve' };
    const base = {
      analogLiveReload: true as const,
      angularComponentProbe: probe,
      generator: {
        projectId: 'composition',
        workspaceRoot: root,
        defaults: {
          docsRoot: root,
          tsConfig: path.join(root, 'tsconfig.json'),
          outputRoot: path.join(root, 'generated'),
          cacheRoot: path.join(root, 'cache'),
        },
      },
    };
    expect(() => createNgDocVitePlugin({ ...base, angularPlugins: [compiler, companion] })).toThrow(
      'NGDOC_VITE_ANGULAR_COMPATIBILITY',
    );
    const qualified = qualifyAngularPlugins([compiler, companion]);
    expect(() => createNgDocVitePlugin({ ...base, angularPlugins: [compiler] })).toThrow(
      'NGDOC_VITE_ANGULAR_COMPATIBILITY',
    );
    const composed = createNgDocVitePlugin({ ...base, angularPlugins: qualified });
    const wrapped = composed.find(({ name }) => name === compiler.name)!;
    expect(composed).toContain(companion);
    expect(wrapped).not.toBe(compiler);
    expect(wrapped.enforce).toBe('pre');
    expect(wrapped.buildStart).toMatchObject({ order: 'pre', sequential: true });
    expect(wrapped.handleHotUpdate).toMatchObject({ order: 'pre' });
    expect(wrapped.transform).toMatchObject({ order: 'post', filter: { id: /\.ts$/ } });

    expect(() => createNgDocVitePlugin({ ...base, angularPlugins: [companion] })).toThrow(
      'Expected exactly one',
    );
    expect(() =>
      createNgDocVitePlugin({ ...base, angularPlugins: [compiler, { ...compiler }] }),
    ).toThrow('received 2');
    expect(() =>
      createNgDocVitePlugin({
        ...base,
        angularPlugins: [{ ...compiler, name: '@analogjs/vite-plugin-angular-fast-compile' }],
      }),
    ).toThrow('fastCompile');
    expect(() =>
      createNgDocVitePlugin({
        ...base,
        angularPlugins: [{ name: '@analogjs/vite-plugin-angular' }],
      }),
    ).toThrow('must expose');
    expect(() =>
      resolveOptions({ ...base, angularPlugins: [], angularComponentProbe: 'relative.ts' }),
    ).toThrow('non-empty');
    expect(() =>
      resolveOptions({ ...base, angularPlugins: [compiler], angularComponentProbe: 'relative.ts' }),
    ).toThrow('absolute application .ts');
  });

  it('validates candidate metadata and formats diagnostic fallbacks', () => {
    const root = path.resolve('/tmp/vite-metadata');
    expect(() => requirePublishedConfiguration({} as never)).toThrow('no configuration');
    expect(() =>
      requirePublishedConfiguration({
        configuration: { ...configuration(root, 'assets'), outputRoot: 'relative' },
      } as never),
    ).toThrow('paths are invalid');
    expect(
      sameRuntimeConfiguration(configuration(root, 'assets'), configuration(root, 'assets')),
    ).toBe(true);
    expect(
      sameRuntimeConfiguration(configuration(root, 'assets'), configuration(root, 'different')),
    ).toBe(false);
    const diagnostic = {
      code: 'EXAMPLE',
      message: 'failed',
      severity: 'error' as const,
      stage: 'host' as const,
      source: { path: '/source.ts', line: 4 },
    };
    expect(diagnosticText(diagnostic)).toContain('/source.ts:4');
    expect(resultError(result('failure', 1), 'fallback').message).toBe('fallback');
    expect(
      resultError({ ...result('failure', 1), diagnostics: [diagnostic] }, 'fallback').message,
    ).toContain('EXAMPLE');
  });
});

class FakeWatcher extends EventEmitter {
  readonly added: string[] = [];
  // The FSEvents backend, which watches missing paths itself: every target reaches add().
  readonly options = { useFsEvents: true };
  failAdds = 0;
  readonly close = vi.fn(async () => {});
  readonly unwatch = vi.fn(async () => {});

  add(values: string | readonly string[]): this {
    if (this.failAdds > 0) {
      this.failAdds -= 1;
      throw new Error('registration failed');
    }
    this.added.push(...(typeof values === 'string' ? [values] : values));
    return this;
  }
}

interface Fixture {
  root: string;
  docs: string;
  output: string;
  cache: string;
  config: string;
  tsconfig: string;
  markdown: string;
  app: string;
  appTemplate: string;
  coldResource: string;
}

/** Closes a server within `ms`; on timeout, fails with the process's active resources. */
async function closeWithin(server: ViteDevServer, ms: number): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const outcome = await Promise.race([
    server.close().then(() => 'closed' as const),
    new Promise<'timeout'>((resolve) => {
      timer = setTimeout(() => resolve('timeout'), ms);
    }),
  ]);
  clearTimeout(timer);
  if (outcome === 'timeout') {
    throw new Error(
      `Vite server did not close within ${ms} ms; active resources: ${JSON.stringify(
        process.getActiveResourcesInfo(),
      )}`,
    );
  }
}

/** NgDoc compiler workers and SSR renderers that this test process still has as children. */
function ownedChildProcesses(): string[] {
  return execFileSync('ps', ['-A', '-o', 'ppid=,command='], { encoding: 'utf8' })
    .split('\n')
    .map((line) => line.trim().match(/^(\d+)\s+(.*)$/))
    .filter((match): match is RegExpMatchArray => Number(match?.[1]) === process.pid)
    .map((match) => match[2]!)
    .filter((command) => /worker\/entry\.js|ssr-renderer-entry/.test(command));
}

async function directory(): Promise<string> {
  const runtime = path.join(import.meta.dirname, '.runtime');
  await mkdir(runtime, { recursive: true });
  const root = await mkdtemp(path.join(runtime, 'ng-doc-vite-'));
  temporary.push(root);
  return root;
}

async function project(): Promise<Fixture> {
  const root = await directory();
  const docs = path.join(root, 'docs');
  const output = path.join(root, 'generated');
  const cache = path.join(root, 'cache');
  const config = path.join(root, 'ng-doc.config.mjs');
  const tsconfig = path.join(root, 'tsconfig.json');
  const markdown = path.join(docs, 'guide.md');
  const app = path.join(root, 'src/app.component.ts');
  const appTemplate = path.join(root, 'src/app.component.html');
  const coldResource = path.join(root, 'src/unimported-resource.html');
  await mkdir(docs, { recursive: true });
  await symlink(path.join(repository, 'node_modules'), path.join(root, 'node_modules'), 'dir');
  await writeFile(path.join(root, '.editorconfig'), 'root = true\n');
  await writeConfiguration(config);
  await writeFile(
    tsconfig,
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'bundler',
        strict: true,
        experimentalDecorators: true,
        skipLibCheck: true,
        types: [],
        baseUrl: root,
        paths: {
          '@ng-doc/generated': [path.join(output, 'index.ts')],
          '@ng-doc/app': [path.join(repository, 'libs/app/index.ts')],
          '@ng-doc/app/*': [path.join(repository, 'libs/app/*')],
          '@ng-doc/core': [path.join(repository, 'libs/core/index.ts')],
          '@ng-doc/core/*': [path.join(repository, 'libs/core/*')],
          '@ng-doc/ui-kit': [path.join(repository, 'libs/ui-kit/index.ts')],
          '@ng-doc/ui-kit/*': [path.join(repository, 'libs/ui-kit/*')],
        },
      },
      angularCompilerOptions: { strictTemplates: true, strictInjectionParameters: true },
      include: ['docs/**/*.ts', 'src/**/*.ts', 'generated/**/*.ts'],
    }),
  );
  await writeFile(
    path.join(docs, 'ng-doc.page.ts'),
    `const Guide = { title: 'Guide', route: 'guide', mdFile: './guide.md' };\nexport default Guide;\n`,
  );
  await writeFile(markdown, '# Guide\nInitial native Vite body with searchable text.\n');
  await mkdir(path.join(root, 'src'), { recursive: true });
  await writeFile(
    app,
    `import { Component } from '@angular/core';\n@Component({ selector: 'fixture-app', templateUrl: './app.component.html' })\nexport class AppComponent {}\n`,
  );
  await writeFile(appTemplate, 'initial external resource marker');
  await writeFile(coldResource, 'initial cold external resource marker');
  await writeFile(
    path.join(root, 'src/main.ts'),
    `import { NG_DOC_ROUTING } from '@ng-doc/generated';\ndocument.body.dataset.routes = String(NG_DOC_ROUTING.length);\n`,
  );
  await writeFile(
    path.join(root, 'index.html'),
    '<html><head></head><body>fixture<script type="module" src="/src/main.ts"></script></body></html>',
  );
  return { root, docs, output, cache, config, tsconfig, markdown, app, appTemplate, coldResource };
}

async function writeConfiguration(file: string, outDir?: string): Promise<void> {
  await writeFile(
    file,
    `export default { docsPath: 'docs', tsConfig: 'tsconfig.json', routePrefix: '', cache: true${outDir ? `, outDir: ${JSON.stringify(outDir)}` : ''} };\n`,
  );
}

interface CompilerOverride {
  module: string;
  workerEntryUrl: URL;
  templateRoot: string;
  /**
   * Generation-counting tests watch by polling. macOS FSEvents also reports metadata-only activity
   * on freshly written fixture files (reproduced under load: every fixture file reported as
   * `update` during startup with its mtime still before the server started). The adapter rightly
   * treats a native event as a possible change, so such notifications would add generations that
   * are neither NgDoc's nor the edit's. Polling reports content (mtime/size) changes only.
   */
  polling?: boolean;
}

let sourceBundle: Promise<SourceCompilerBundle> | undefined;
afterAll(async () => {
  await (await sourceBundle)?.dispose();
});

/** The working-tree compiler, bundled once per file, instead of the previously built dist. */
function sourceCompiler(): Promise<SourceCompilerBundle> {
  return (sourceBundle ??= bundleSourceCompiler());
}

interface CompileRecord {
  generation: number;
  origin: string | null;
  changes: number;
  paths: string[];
  digest: string | null;
  ownedFiles: number;
  rebuilt: number;
  errors: number;
}

/** Wraps a compiler module and appends one record per generation; optionally races generation 1. */
async function recordingCompiler(
  base: string,
  fixture: Fixture,
  log: string,
  race?: string,
): Promise<string> {
  const wrapper = path.join(await directory(), 'recording-compiler.mjs');
  await writeFile(
    wrapper,
    `import { appendFileSync, writeFileSync } from 'node:fs';
const real = await import(${JSON.stringify(pathToFileURL(base).href)});
const owned = ${JSON.stringify([fixture.output, fixture.cache])};
const isOwned = (file) => owned.some((root) => file === root || file.startsWith(root + '/'));
export async function createCompilationService(options) {
  const service = await real.createCompilationService(options);
  return {
    async compile(request, signal, context) {
      const result = await service.compile(request, signal, context);
      const semantic = result.dependencies.find((item) => item.kind === 'semantic');
      appendFileSync(${JSON.stringify(log)}, JSON.stringify({
        generation: request.generation,
        origin: request.contentRequest?.origin ?? null,
        changes: request.changes.length,
        paths: request.changes.map((item) => item.kind + ':' + item.path),
        digest: semantic?.digest ?? null,
        ownedFiles: result.dependencies
          .flatMap((item) => item.kind === 'semantic' ? item.files : 'path' in item ? [item.path] : [])
          .filter(isOwned).length,
        rebuilt: result.whyRebuilt.length,
        errors: result.diagnostics.filter((item) => item.severity === 'error').length,
      }) + '\\n');
      ${race ? `if (request.generation === 1) writeFileSync(${JSON.stringify(fixture.markdown)}, ${JSON.stringify(race)});` : ''}
      return result;
    },
    dispose: () => service.dispose(),
  };
}
`,
  );
  return wrapper;
}

async function compiles(log: string): Promise<CompileRecord[]> {
  if (!existsSync(log)) return [];
  return (await readFile(log, 'utf8'))
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as CompileRecord);
}

/**
 * A wall-clock instant no earlier than every write already made: `Date.now()` truncates to whole
 * milliseconds while file mtimes are fractional, so a fixture file written in the current
 * millisecond could otherwise appear to be newer than the instant taken after writing it.
 */
function startInstant(): number {
  return Date.now() + 1;
}

/** Failure context: every recorded change with its mtime relative to `since`. */
async function staleEvidence(log: string, since: number): Promise<string> {
  return (await compiles(log))
    .flatMap((record) => record.paths.map((entry) => `generation ${record.generation} ${entry}`))
    .map((entry) => {
      const file = entry.slice(entry.indexOf(':') + 1);
      let mtime = 'missing';
      try {
        mtime = `${Math.round(statSync(file).mtimeMs - since)}ms`;
      } catch {
        // A missing file keeps the 'missing' mtime.
      }
      return `${entry} mtime=${mtime} relative to server start`;
    })
    .join('\n');
}

/**
 * Replaces the fixture page the way editors save it, so a generation started by the first native
 * event can never read a truncated file. Generation-counting assertions otherwise race
 * `writeFile`'s truncate-then-write under load.
 */
async function replaceAtomically(fixture: Fixture, text: string): Promise<void> {
  // Staged beside, not inside, the watched fixture root (same volume, so rename is atomic).
  const staged = path.join(
    path.dirname(fixture.root),
    `.${path.basename(fixture.root)}-${path.basename(fixture.markdown)}.${Date.now()}.tmp`,
  );
  await writeFile(staged, text);
  await rename(staged, fixture.markdown);
}

/** Waits until no further generation has been recorded for `quiet` milliseconds. */
async function quiescent(log: string, quiet: number = 1_500): Promise<void> {
  let count = -1;
  let stable = Date.now();
  const deadline = Date.now() + 30_000;
  for (;;) {
    const current = (await compiles(log)).length;
    if (current !== count) {
      count = current;
      stable = Date.now();
    } else if (Date.now() - stable >= quiet) {
      return;
    }
    if (Date.now() > deadline) throw new Error('Generations did not settle');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

async function manifestGeneration(fixture: Fixture): Promise<number> {
  return JSON.parse(
    await readFile(path.join(fixture.output, '.ng-doc-output-manifest.json'), 'utf8'),
  ).generation;
}

async function start(
  fixture: Fixture,
  plugins: Plugin[] = [],
  compiler?: CompilerOverride,
): Promise<ViteDevServer> {
  const server = await createServer({
    root: fixture.root,
    // Its own dependency cache (below a node_modules folder, as linters and editors skip): the
    // default one is shared by every fixture.
    cacheDir: path.join(fixture.root, '.vite/node_modules/.vite'),
    configFile: false,
    base: '/preview/',
    plugins: [plugin(fixture, undefined, compiler), ...plugins],
    resolve: { alias: packageAliases(), dedupe: angularPackages() },
    server: {
      host: '127.0.0.1',
      port: 0,
      ...(compiler?.polling
        ? { watch: { usePolling: true, interval: 50, binaryInterval: 50 } }
        : {}),
    },
    logLevel: 'silent',
  });
  servers.push(server);
  return server;
}

function plugin(
  fixture: Fixture,
  angularPlugins: Plugin[] = fakeAngularPlugins(fixture.app),
  compiler?: CompilerOverride,
) {
  // Explicit fixture attestation for adapter mechanics (including the two stock-compiler probes).
  // This is not evidence for the patched compiler; native resource/package acceptance uses the
  // actual built createNgDocAngularPlugins entry without this test-only qualification.
  return createNgDocVitePlugin({
    analogLiveReload: true,
    angularPlugins: qualifyAngularPlugins(angularPlugins),
    angularComponentProbe: fixture.app,
    generator: {
      projectId: 'vite-fixture',
      workspaceRoot: fixture.root,
      configFile: fixture.config,
      defaults: {
        docsRoot: fixture.docs,
        tsConfig: fixture.tsconfig,
        outputRoot: fixture.output,
        cacheRoot: fixture.cache,
      },
      templateRoot:
        compiler?.templateRoot ?? path.join(repository, 'dist/libs/builder/generator/templates'),
      worker: {
        moduleUrl: pathToFileURL(
          compiler?.module ??
            path.join(repository, 'dist/libs/builder/generator/compiler/index.js'),
        ),
        workerEntryUrl:
          compiler?.workerEntryUrl ??
          pathToFileURL(path.join(repository, 'dist/libs/builder/generator/worker/entry.js')),
      },
      session: { batchDelayMs: 5 },
    },
  });
}

function fakeAngularPlugins(probe: string): Plugin[] {
  return [
    {
      name: '@analogjs/vite-plugin-angular',
      buildStart() {},
      handleHotUpdate(context: HmrContext) {
        return context.modules;
      },
      transform: {
        filter: { id: /\.ts$/ },
        handler(_code: string, id: string) {
          if (path.resolve(id.replace(/\?.*$/, '')) !== path.resolve(probe)) return;
          return {
            code: 'export class AppComponent {}; AppComponent.ɵcmp = {};',
            map: null,
          };
        },
      },
    },
    { name: 'fake-angular-companion' },
  ];
}

/**
 * Analog's plugins as a production build creates them. Under Vitest (`VITEST`, `NODE_ENV=test`)
 * Analog emits nothing on demand and hands every TypeScript file to Vite's own transform instead
 * (`angularVitestSourcemapPlugin`); with Vite 8 that is Oxc, which, unlike esbuild, honours the
 * workspace's `emitDecoratorMetadata`, so a type-only import stays and Rolldown reports it missing.
 * @param options - The Analog plugin options.
 */
function aotAngular(options: Parameters<typeof angular>[0]): ReturnType<typeof angular> {
  const saved = { VITEST: process.env['VITEST'], NODE_ENV: process.env['NODE_ENV'] };
  delete process.env['VITEST'];
  process.env['NODE_ENV'] = 'production';
  try {
    return angular(options);
  } finally {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

function packageAliases() {
  // The package entry is the library's `index.ts`: Vite 8 resolves a directory through the
  // `exports` of its package.json, and `libs/app/package.json` exports only its style sheets.
  return ['app', 'core', 'ui-kit'].flatMap((name) => [
    {
      find: new RegExp(`^@ng-doc/${name}$`),
      replacement: path.join(repository, `libs/${name}/index.ts`),
    },
    {
      find: new RegExp(`^@ng-doc/${name}/`),
      replacement: `${path.join(repository, `libs/${name}`)}/`,
    },
  ]);
}

function angularPackages(): string[] {
  return [
    '@angular/core',
    '@angular/common',
    '@angular/compiler',
    '@angular/platform-browser',
    '@angular/router',
    'rxjs',
  ];
}

const normalizePath = (value: string): string => path.resolve(value).replace(/\\/g, '/');

/**
 * Resolves once the event source has reported a change of `probe`, an input in the directory
 * under test: that directory's watch is live then. Linux's inotify watch is live when `fs.watch`
 * returns, but macOS starts a directory watch asynchronously and signals nothing.
 */
async function reportedOnce(
  probe: string,
  events: ReadonlyArray<{ kind: string; path: string }>,
): Promise<void> {
  const reported = () => events.some((event) => event.path === normalizePath(probe));
  let round = 0;
  await waitFor(async () => {
    if (reported()) return true;
    await writeFile(probe, String(round++));
    await new Promise((resolve) => setTimeout(resolve, 50));
    return reported();
  });
}

/**
 * Resolves once chokidar has a native listener for every path. It attaches a new path only after
 * asynchronous `stat` and `realpath` calls and signals nothing per path, and a file created before
 * its listener exists is never reported. chokidar records a path's closer right after attaching
 * the path's listener.
 */
async function nativelyWatched(watcher: FSWatcher, paths: readonly string[]): Promise<void> {
  const closers = (watcher as unknown as { _closers: ReadonlyMap<string, unknown> })._closers;
  await waitFor(async () => paths.every((target) => closers.has(target)));
}

async function waitFor(predicate: () => Promise<boolean>, timeout: number = 20_000): Promise<void> {
  const deadline = Date.now() + timeout;
  // The output committer replaces a published file by renaming it to a backup and then renaming
  // the staged file into place, so a concurrent read can briefly observe ENOENT.
  const settled = () =>
    predicate().catch((error: NodeJS.ErrnoException) => {
      if (error?.code === 'ENOENT') return false;
      throw error;
    });
  while (!(await settled())) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for native Vite update');
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

async function filesWithSuffix(root: string, suffix: string): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const file = path.join(root, entry.name);
    if (entry.isDirectory()) result.push(...(await filesWithSuffix(file, suffix)));
    else if (entry.name.endsWith(suffix)) result.push(file);
  }
  return result.sort();
}

function rawStatus(origin: string, requestPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const target = new URL(origin);
    const request = httpRequest(
      {
        hostname: target.hostname,
        port: target.port,
        path: requestPath,
      },
      (response) => {
        response.resume();
        response.once('end', () => resolve(response.statusCode ?? 0));
      },
    );
    request.once('error', reject);
    request.end();
  });
}

async function html(origin: string): Promise<{ status: number; body: string }> {
  const response = await fetch(`${origin}/preview/`, { headers: { accept: 'text/html' } });
  return { status: response.status, body: await response.text() };
}

function middlewareResult(
  inventory: GeneratedAssetInventory,
  url?: string,
): Promise<{ status: number; body?: Buffer | string; contentType?: string; next?: boolean }> {
  return new Promise((resolve) => {
    let statusCode = 200;
    let contentType: string | undefined;
    inventory.middleware('/')(
      { url } as never,
      {
        get statusCode() {
          return statusCode;
        },
        set statusCode(value: number) {
          statusCode = value;
        },
        setHeader(name: string, value: string) {
          if (name.toLowerCase() === 'content-type') contentType = value;
        },
        end(body?: Buffer | string) {
          resolve({ status: statusCode, ...(body === undefined ? {} : { body }), contentType });
        },
      } as never,
      () => resolve({ status: statusCode, next: true }),
    );
  });
}

function inputs(files: string[], globs: WatchInputs['globs'] = []): WatchInputs {
  return { files, globs };
}

function result(
  status: BuildResult['status'],
  generation: number,
  watchInputs?: WatchInputs,
): BuildResult {
  if (status === 'cancelled') {
    return { status, generation, diagnostics: [], whyRebuilt: [] };
  }
  if (status === 'failure') {
    return {
      status,
      generation,
      diagnostics: [],
      whyRebuilt: [],
      ...(watchInputs ? { watchInputs } : {}),
    };
  }
  return {
    status,
    generation,
    snapshot: undefined as never,
    manifest: undefined as never,
    diagnostics: [],
    whyRebuilt: [],
    ...(watchInputs ? { watchInputs } : {}),
  };
}

function configuration(root: string, assetDirectory: string) {
  return {
    outputRoot: root,
    cacheRoot: path.join(root, 'cache'),
    assetDirectory,
    themes: { light: 'github-light', dark: 'ayu-dark' },
    digest: createHash('sha256').update(root).digest('hex'),
  };
}

function successResult(
  root: string,
  assetDirectory: string,
): Extract<BuildResult, { status: 'success' }> {
  return {
    status: 'success',
    generation: 1,
    snapshot: {
      projectId: 'test',
      revision: 'one',
      artifacts: [],
      globalKeywords: [],
      remoteKeywords: [],
    },
    manifest: {
      schemaVersion: 1,
      projectId: 'test',
      generation: 1,
      revision: 'one',
      files: [
        {
          path: `${assetDirectory}/value.json`,
          ownerId: 'aggregate:test',
          digest: 'x',
          role: 'asset',
        },
      ],
    },
    diagnostics: [],
    whyRebuilt: [],
  };
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function outputManifest(
  files: Array<[path: string, digest: string, role: OutputManifest['files'][number]['role']]>,
): OutputManifest {
  return {
    schemaVersion: 1,
    projectId: 'test',
    generation: 1,
    revision: 'test',
    files: files.map(([filePath, fileDigest, role]) => ({
      path: filePath,
      digest: fileDigest,
      role,
      ownerId: 'aggregate:test',
    })),
  };
}

function successWithManifest(
  generation: number,
  manifest: OutputManifest,
): Extract<BuildResult, { status: 'success' }> {
  return {
    ...successResult('/tmp/unused', 'assets'),
    generation,
    manifest: { ...manifest, generation },
  };
}
