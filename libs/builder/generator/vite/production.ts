import { rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { type InlineConfig, type Plugin, type ResolvedConfig, build as viteBuild } from 'vite';

import type { BuildResult, PublishedGeneratorConfiguration } from '../contracts';
import type { NgDocViteApplicationApi } from './application';
import { type NgDocPrerenderOptions, prerenderNgDoc } from './prerender';
import type { PrerenderReport } from './prerender-runtime';
import { assertSupportedViteVersion } from './vite-version';

export interface NgDocViteBuildOptions {
  /** The Vite configuration file of the application (the one `vite build` would load). */
  configFile: string;
  /**
   * The output directory: the client build goes to `browser/`, the server bundle to
   * `server/server.mjs`, the prerendered route list to `prerendered-routes.json`.
   */
  outputPath: string;
  /** The Vite mode (default `production`). */
  mode?: string;
  /** Build the server bundle (default: when the application plugin has a `server` entry). */
  ssr?: boolean;
  /** Prerender every route into `browser/` (default: when the server bundle is built). */
  prerender?: boolean;
  /** Routes prerendered in addition to the discovered ones. */
  routes?: readonly string[];
  /** Enumerate the application's routes (default true). */
  discoverRoutes?: boolean;
  /** Skip the client and server builds and prerender an existing output. */
  skipBuild?: boolean;
  /** Fails a route that takes longer to render, in milliseconds (default: no limit). */
  routeTimeoutMs?: number;
  /** Progress lines (one per step). */
  log?: (message: string) => void;
  signal?: AbortSignal;
}

export interface NgDocViteBuildResult {
  browser: string;
  server?: string;
  prerendered?: PrerenderReport;
}

/** @internal Injectable host ports for tests. */
export interface NgDocViteBuildDependencies {
  build(config: InlineConfig): Promise<unknown>;
  prerender(options: NgDocPrerenderOptions): Promise<PrerenderReport>;
}

const defaultDependencies: NgDocViteBuildDependencies = {
  build: viteBuild,
  prerender: prerenderNgDoc,
};

/**
 * @internal The NgDoc generation of one production pipeline, shared by its builds through a
 * plugin's `api.ngDocGeneration` (see `buildNgDocViteApplication`). The NgDoc plugin of the first
 * build records the result it published; the plugin of a later build of the same pipeline, with
 * the same generator options (`key`), publishes that result again instead of generating.
 */
export interface NgDocGenerationHandoff {
  readonly schemaVersion: 1;
  recorded?: {
    key: string;
    result: Extract<BuildResult, { status: 'success' }>;
    configuration: PublishedGeneratorConfiguration;
  };
}

function generationHandoff(): Plugin {
  const handoff: NgDocGenerationHandoff = { schemaVersion: 1 };
  return { name: '@ng-doc/vite:generation-handoff', api: { ngDocGeneration: handoff } };
}

function buildError(code: string, message: string): Error {
  return new Error(`[${code}] ${message}`);
}

/** Reads the application plugin's capability from the configuration a build resolved. */
function applicationProbe(): { plugin: Plugin; api(): NgDocViteApplicationApi | undefined } {
  let found: NgDocViteApplicationApi | undefined;
  return {
    plugin: {
      name: '@ng-doc/vite:build-probe',
      configResolved(config: ResolvedConfig) {
        const matches = config.plugins.filter(
          (plugin) => plugin.api?.ngDocApplication?.schemaVersion === 1,
        );
        if (matches.length > 1) {
          throw buildError(
            'NGDOC_VITE_APPLICATION',
            'Expected at most one createNgDocApplicationPlugin in the Vite configuration.',
          );
        }
        found = matches[0]?.api.ngDocApplication as NgDocViteApplicationApi | undefined;
      },
    },
    api: () => found,
  };
}

/**
 * The production build of a Vite + NgDoc application, as the Angular CLI application builder
 * lays it out: the client build, then (with a server entry) a self-contained server bundle, then
 * every route prerendered into the client output.
 *
 * Each step loads `configFile` again, but NgDoc generates once: the server build publishes the
 * browser build's generation again (`NgDocGenerationHandoff`), so both bundles are built from the
 * same generated sources.
 */
export async function buildNgDocViteApplication(
  options: NgDocViteBuildOptions,
  dependencies: NgDocViteBuildDependencies = defaultDependencies,
): Promise<NgDocViteBuildResult> {
  // Before anything touches the output directory.
  assertSupportedViteVersion();
  const configFile = path.resolve(options.configFile);
  const outputPath = path.resolve(options.outputPath);
  const browser = path.join(outputPath, 'browser');
  const serverDirectory = path.join(outputPath, 'server');
  const serverEntry = path.join(serverDirectory, 'server.mjs');
  const mode = options.mode ?? 'production';
  const log = options.log ?? (() => {});
  const aborted = () => {
    if (options.signal?.aborted)
      throw buildError('NGDOC_VITE_BUILD_ABORTED', 'The build was aborted.');
  };
  const timed = async <T>(label: string, step: () => Promise<T>): Promise<T> => {
    const started = Date.now();
    const value = await step();
    log(`${label} in ${((Date.now() - started) / 1000).toFixed(1)} s`);
    return value;
  };

  let ssr = options.ssr;
  const noServer = () =>
    buildError(
      'NGDOC_VITE_SERVER_ENTRY',
      'Prerendering needs the server bundle: build it (ssr) from createNgDocApplicationPlugin with a server entry.',
    );
  if (!options.skipBuild && options.prerender === true && options.ssr === false) throw noServer();
  if (!options.skipBuild) {
    const probe = applicationProbe();
    const generation = generationHandoff();
    await timed(`Built the browser bundle into ${browser}`, () =>
      dependencies.build({
        configFile,
        mode,
        plugins: [probe.plugin, generation],
        build: { outDir: browser, emptyOutDir: true },
      }),
    );
    aborted();
    const entry = probe.api()?.serverEntry;
    ssr ??= entry !== undefined;
    if (!ssr) {
      // A server bundle or route list of an earlier build would no longer match this browser build.
      await rm(serverDirectory, { recursive: true, force: true });
      await rm(path.join(outputPath, 'prerendered-routes.json'), { force: true });
      if (options.prerender === true) throw noServer();
    } else {
      if (!entry) {
        throw buildError(
          'NGDOC_VITE_SERVER_ENTRY',
          'The server build needs createNgDocApplicationPlugin with a server entry in the Vite configuration.',
        );
      }
      await timed(`Built the server bundle into ${serverDirectory}`, () =>
        dependencies.build({
          configFile,
          mode,
          plugins: [generation],
          build: {
            ssr: true,
            outDir: serverDirectory,
            emptyOutDir: true,
            rolldownOptions: {
              input: { server: entry },
              output: {
                format: 'es',
                entryFileNames: '[name].mjs',
                chunkFileNames: 'chunks/[name]-[hash].mjs',
              },
            },
          },
        }),
      );
      aborted();
    }
  }
  const prerender = options.prerender ?? (options.skipBuild ? true : ssr === true);
  if (!prerender) return { browser, ...(ssr ? { server: serverEntry } : {}) };
  const report = await timed('Prerendered the routes', () =>
    dependencies.prerender({
      browserDir: browser,
      serverEntry,
      routes: options.routes ?? [],
      discoverRoutes: options.discoverRoutes ?? true,
      ...(options.routeTimeoutMs === undefined ? {} : { routeTimeoutMs: options.routeTimeoutMs }),
      ...(options.signal ? { signal: options.signal } : {}),
    }),
  );
  await writeFile(
    path.join(outputPath, 'prerendered-routes.json'),
    `${JSON.stringify({ routes: report.routes, excluded: report.excluded }, null, 2)}\n`,
  );
  log(`Prerendered ${report.routes.length} route(s) into ${browser}`);
  if (report.errors.length) {
    log(`The application logged ${report.errors.length} error(s) while prerendering:`);
    for (const { route, message } of report.errors.slice(0, 10)) log(`  ${route}: ${message}`);
  }
  return { browser, server: serverEntry, prerendered: report };
}
