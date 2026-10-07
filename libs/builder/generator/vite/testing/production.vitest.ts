import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { firstValueFrom, lastValueFrom, take, toArray } from 'rxjs';
import type { InlineConfig, Plugin, ResolvedConfig } from 'vite';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NG_DOC_SERVER_ENTRY } from '../application';
import {
  type NgDocViteBuilderDependencies,
  runViteApplicationBuilder,
  runViteDevServerBuilder,
  viteApplicationBuilderOutputs,
} from '../builders';
import { type NgDocViteBuildDependencies, buildNgDocViteApplication } from '../production';

const temporary: string[] = [];

afterEach(async () => {
  await Promise.all(temporary.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function directory(): Promise<string> {
  const runtime = path.join(import.meta.dirname, '.runtime');
  await mkdir(runtime, { recursive: true });
  const root = await mkdtemp(path.join(runtime, 'ng-doc-production-'));
  temporary.push(root);
  return root;
}

/**
 * A Vite `build` double that resolves the inline configuration's plugins against `plugins`.
 */
function builds(plugins: Array<Partial<Plugin>>) {
  const calls: InlineConfig[] = [];
  const build = vi.fn(async (config: InlineConfig) => {
    calls.push(config);
    for (const plugin of (config.plugins ?? []) as Plugin[]) {
      (plugin.configResolved as (config: ResolvedConfig) => void)?.({
        plugins: plugins as Plugin[],
      } as unknown as ResolvedConfig);
    }
  });
  return { calls, build };
}

const report = {
  routes: [{ path: '/', file: 'index.html' }],
  excluded: [],
  shell: 'index.csr.html',
  errors: [] as Array<{ route: string; message: string }>,
};

describe('buildNgDocViteApplication', () => {
  it('builds the browser and server bundles, prerenders and records the routes', async () => {
    const output = await directory();
    const { calls, build } = builds([
      { name: 'other' },
      {
        name: 'app',
        api: { ngDocApplication: { schemaVersion: 1, serverEntry: NG_DOC_SERVER_ENTRY } },
      },
    ]);
    const prerender = vi.fn(async () => report);
    const log = vi.fn();
    const result = await buildNgDocViteApplication(
      { configFile: 'vite.config.mjs', outputPath: output, routes: ['/x'], log },
      { build, prerender } satisfies NgDocViteBuildDependencies,
    );
    expect(calls[0]).toMatchObject({
      configFile: path.resolve('vite.config.mjs'),
      mode: 'production',
      build: { outDir: path.join(output, 'browser'), emptyOutDir: true },
    });
    expect(calls[1]).toMatchObject({
      mode: 'production',
      build: {
        ssr: true,
        outDir: path.join(output, 'server'),
        rolldownOptions: {
          input: { server: NG_DOC_SERVER_ENTRY },
          output: { entryFileNames: '[name].mjs' },
        },
      },
    });
    // Both builds share one handoff, so NgDoc generates once for the pipeline.
    const handoff = (config: InlineConfig) =>
      (config.plugins as Plugin[]).find((plugin) => plugin.api?.ngDocGeneration);
    expect(handoff(calls[0])?.api.ngDocGeneration).toEqual({ schemaVersion: 1 });
    expect(handoff(calls[1])).toBe(handoff(calls[0]));
    expect(prerender).toHaveBeenCalledWith({
      browserDir: path.join(output, 'browser'),
      serverEntry: path.join(output, 'server/server.mjs'),
      routes: ['/x'],
      discoverRoutes: true,
    });
    expect(result).toEqual({
      browser: path.join(output, 'browser'),
      server: path.join(output, 'server/server.mjs'),
      prerendered: report,
    });
    expect(
      JSON.parse(await readFile(path.join(output, 'prerendered-routes.json'), 'utf8')),
    ).toEqual({
      routes: report.routes,
      excluded: [],
    });
    expect(log.mock.calls.map(([line]) => line)).toEqual([
      expect.stringMatching(/^Built the browser bundle into .* in \d+\.\d s$/),
      expect.stringMatching(/^Built the server bundle into .* in \d+\.\d s$/),
      expect.stringMatching(/^Prerendered the routes in \d+\.\d s$/),
      `Prerendered 1 route(s) into ${path.join(output, 'browser')}`,
    ]);
  });

  it('builds only the browser bundle without a server entry, or when asked', async () => {
    const output = await directory();
    const prerender = vi.fn(async () => report);
    const client = builds([{ name: 'app', api: { ngDocApplication: { schemaVersion: 1 } } }]);
    expect(
      await buildNgDocViteApplication(
        { configFile: 'a', outputPath: output, mode: 'staging' },
        {
          build: client.build,
          prerender,
        },
      ),
    ).toEqual({ browser: path.join(output, 'browser') });
    expect(client.calls).toHaveLength(1);
    expect(client.calls[0].mode).toBe('staging');

    const serverOnly = builds([
      {
        name: 'app',
        api: { ngDocApplication: { schemaVersion: 1, serverEntry: NG_DOC_SERVER_ENTRY } },
      },
    ]);
    expect(
      await buildNgDocViteApplication(
        {
          configFile: 'a',
          outputPath: output,
          prerender: false,
          signal: new AbortController().signal,
        },
        { build: serverOnly.build, prerender },
      ),
    ).toEqual({
      browser: path.join(output, 'browser'),
      server: path.join(output, 'server/server.mjs'),
    });
    const none = builds([]);
    await buildNgDocViteApplication(
      { configFile: 'a', outputPath: output, ssr: false },
      {
        build: none.build,
        prerender,
      },
    );
    expect(none.calls).toHaveLength(1);
    expect(prerender).not.toHaveBeenCalled();
  });

  it('never prerenders a stale server bundle', async () => {
    const output = await directory();
    const prerender = vi.fn(async () => report);
    const stale = async () => {
      await mkdir(path.join(output, 'server'), { recursive: true });
      await writeFile(path.join(output, 'server/server.mjs'), 'old');
      await writeFile(path.join(output, 'prerendered-routes.json'), '{}');
    };
    // Asked to prerender without the server build: rejected before anything is built.
    const explicit = builds([]);
    await expect(
      buildNgDocViteApplication(
        { configFile: 'a', outputPath: output, ssr: false, prerender: true },
        { build: explicit.build, prerender },
      ),
    ).rejects.toThrow(/\[NGDOC_VITE_SERVER_ENTRY\] Prerendering needs the server bundle/);
    expect(explicit.calls).toEqual([]);
    // No server entry: the earlier server output is removed, then prerendering is rejected.
    await stale();
    const client = builds([{ name: 'app', api: { ngDocApplication: { schemaVersion: 1 } } }]);
    await expect(
      buildNgDocViteApplication(
        { configFile: 'a', outputPath: output, prerender: true },
        { build: client.build, prerender },
      ),
    ).rejects.toThrow(/NGDOC_VITE_SERVER_ENTRY/);
    expect(existsSync(path.join(output, 'server'))).toBe(false);
    expect(existsSync(path.join(output, 'prerendered-routes.json'))).toBe(false);
    // ssr: false removes it as well.
    await stale();
    await buildNgDocViteApplication(
      { configFile: 'a', outputPath: output, ssr: false },
      { build: builds([]).build, prerender },
    );
    expect(existsSync(path.join(output, 'server'))).toBe(false);
    expect(prerender).not.toHaveBeenCalled();
  });

  it('prerenders an existing output without building it and reports logged errors', async () => {
    const output = await directory();
    const { calls, build } = builds([]);
    const errors = Array.from({ length: 11 }, (_, index) => ({
      route: `/r${index}`,
      message: 'NG0100',
    }));
    const prerender = vi.fn(async () => ({ ...report, errors }));
    const log = vi.fn();
    const signal = new AbortController().signal;
    await buildNgDocViteApplication(
      {
        configFile: 'a',
        outputPath: output,
        skipBuild: true,
        discoverRoutes: false,
        routeTimeoutMs: 30_000,
        signal,
        log,
      },
      { build, prerender },
    );
    expect(calls).toEqual([]);
    expect(log).toHaveBeenCalledWith('The application logged 11 error(s) while prerendering:');
    expect(log).toHaveBeenCalledWith('  /r9: NG0100');
    expect(log).not.toHaveBeenCalledWith('  /r10: NG0100');
    expect(prerender).toHaveBeenCalledWith(
      expect.objectContaining({
        routes: [],
        discoverRoutes: false,
        routeTimeoutMs: 30_000,
        signal,
      }),
    );
  });

  it('prerenders the demo pages with the demo server bundle and logs their warnings', async () => {
    const output = await directory();
    const { build } = builds([]);
    const prerender = vi.fn(async () => ({
      ...report,
      warnings: [{ route: '/demo-preview/docs/A', message: '[NGDOC_PRERENDER_DEMO_FALLBACK] x' }],
    }));
    const log = vi.fn();
    const options = { configFile: 'a', outputPath: output, skipBuild: true, log };
    // Without the demo application's page and server bundle, prerendering knows no demo pages.
    await buildNgDocViteApplication(options, { build, prerender });
    expect(prerender.mock.calls[0]).toEqual([
      expect.not.objectContaining({ demoServerEntry: expect.anything() }),
    ]);
    await mkdir(path.join(output, 'browser'), { recursive: true });
    await mkdir(path.join(output, 'server'), { recursive: true });
    await writeFile(path.join(output, 'browser/ng-doc-demo.html'), '<ng-doc-demo-app>');
    await writeFile(path.join(output, 'server/demo-server.mjs'), '');
    await buildNgDocViteApplication(options, { build, prerender });
    expect(prerender.mock.calls[1]).toEqual([
      expect.objectContaining({ demoServerEntry: path.join(output, 'server/demo-server.mjs') }),
    ]);
    expect(log).toHaveBeenCalledWith(
      'Warning: /demo-preview/docs/A: [NGDOC_PRERENDER_DEMO_FALLBACK] x',
    );
  });

  it('rejects a server build without a server entry, two application plugins, and an abort', async () => {
    const output = await directory();
    const prerender = vi.fn(async () => report);
    await expect(
      buildNgDocViteApplication(
        { configFile: 'a', outputPath: output, ssr: true },
        {
          build: builds([]).build,
          prerender,
        },
      ),
    ).rejects.toThrow(/\[NGDOC_VITE_SERVER_ENTRY\]/);
    const app = { name: 'app', api: { ngDocApplication: { schemaVersion: 1 } } };
    await expect(
      buildNgDocViteApplication(
        { configFile: 'a', outputPath: output },
        {
          build: builds([app, app]).build,
          prerender,
        },
      ),
    ).rejects.toThrow(/at most one createNgDocApplicationPlugin/);
    const controller = new AbortController();
    const aborting = builds([]);
    aborting.build.mockImplementationOnce(async () => controller.abort());
    await expect(
      buildNgDocViteApplication(
        { configFile: 'a', outputPath: output, signal: controller.signal },
        {
          build: aborting.build,
          prerender,
        },
      ),
    ).rejects.toThrow(/NGDOC_VITE_BUILD_ABORTED/);
  });
});

describe('vite-application and vite-dev-server builders', () => {
  const context = () => ({
    workspaceRoot: '/workspace',
    logger: { info: vi.fn(), error: vi.fn() },
  });

  it('runs the production build with workspace-relative paths', async () => {
    const build = vi.fn(async (options: { log?: (line: string) => void }) => options.log?.('step'));
    const current = context();
    const dependencies = {
      build,
      createServer: vi.fn(),
    } as unknown as NgDocViteBuilderDependencies;
    expect(
      await runViteApplicationBuilder(
        { configFile: 'apps/site/vite.config.mjs', outputPath: 'dist/site' },
        current as never,
        dependencies,
      ),
    ).toEqual({ success: true });
    expect(build).toHaveBeenCalledWith({
      configFile: '/workspace/apps/site/vite.config.mjs',
      outputPath: '/workspace/dist/site',
      mode: 'production',
      log: expect.any(Function),
    });
    expect(current.logger.info).toHaveBeenCalledWith('step');
    await runViteApplicationBuilder(
      {
        configFile: 'a',
        outputPath: 'b',
        mode: 'staging',
        ssr: false,
        prerender: false,
        routes: ['/x'],
        discoverRoutes: false,
        routeTimeout: 1000,
      },
      current as never,
      dependencies,
      new AbortController().signal,
    );
    expect(build).toHaveBeenLastCalledWith(
      expect.objectContaining({
        mode: 'staging',
        ssr: false,
        prerender: false,
        routes: ['/x'],
        discoverRoutes: false,
        routeTimeoutMs: 1000,
        signal: expect.any(AbortSignal),
      }),
    );
    build.mockRejectedValueOnce(new Error('[NGDOC_PRERENDER_FAILED] broken'));
    expect(
      await runViteApplicationBuilder(
        { configFile: 'a', outputPath: 'b' },
        current as never,
        dependencies,
      ),
    ).toEqual({ success: false, error: '[NGDOC_PRERENDER_FAILED] broken' });
    build.mockRejectedValueOnce('plain');
    expect(
      await runViteApplicationBuilder(
        { configFile: 'a', outputPath: 'b' },
        current as never,
        dependencies,
      ),
    ).toEqual({ success: false, error: 'plain' });
    expect(current.logger.error).toHaveBeenCalledWith('plain');
  });

  it('aborts the build when Architect stops the builder', async () => {
    let signal: AbortSignal | undefined;
    let finish!: () => void;
    const dependencies = {
      build: vi.fn(
        (options: { signal?: AbortSignal }) =>
          new Promise<void>((resolve) => {
            signal = options.signal;
            finish = resolve;
          }),
      ),
      createServer: vi.fn(),
    } as unknown as NgDocViteBuilderDependencies;
    const outputs = viteApplicationBuilderOutputs(
      { configFile: 'a', outputPath: 'b' },
      context() as never,
      dependencies,
    );
    const subscription = outputs.subscribe();
    await vi.waitFor(() => expect(signal).toBeDefined());
    subscription.unsubscribe();
    expect(signal!.aborted).toBe(true);
    finish();
    await expect(
      firstValueFrom(
        viteApplicationBuilderOutputs(
          { configFile: 'a', outputPath: 'b' },
          context() as never,
          {
            build: async () => undefined,
            createServer: vi.fn(),
          } as unknown as NgDocViteBuilderDependencies,
        ),
      ),
    ).resolves.toEqual({ success: true });
  });

  function devServer(listen: ReturnType<typeof vi.fn> = vi.fn(async () => undefined)) {
    const server = {
      listen,
      printUrls: vi.fn(),
      close: vi.fn(async () => undefined),
      resolvedUrls: { local: ['http://localhost:5173/'], network: [] },
    };
    return server;
  }

  it('serves until Architect stops the builder, then closes the server', async () => {
    const server = devServer();
    const createServer = vi.fn(async () => server);
    const dependencies = {
      build: vi.fn(),
      createServer,
    } as unknown as NgDocViteBuilderDependencies;
    const outputs = runViteDevServerBuilder(
      { configFile: 'vite.config.mjs', host: '0.0.0.0', port: 4300 },
      context() as never,
      dependencies,
    );
    expect(await firstValueFrom(outputs)).toEqual({
      success: true,
      baseUrl: 'http://localhost:5173/',
    });
    expect(createServer).toHaveBeenCalledWith({
      configFile: '/workspace/vite.config.mjs',
      mode: 'development',
      server: { host: '0.0.0.0', port: 4300 },
    });
    expect(server.printUrls).toHaveBeenCalled();
    await vi.waitFor(() => expect(server.close).toHaveBeenCalledTimes(1));

    const plain = devServer();
    plain.resolvedUrls = null as never;
    await expect(
      firstValueFrom(
        runViteDevServerBuilder(
          { configFile: 'a', mode: 'test' },
          context() as never,
          {
            createServer: async () => plain,
          } as unknown as NgDocViteBuilderDependencies,
        ),
      ),
    ).resolves.toEqual({ success: true });
  });

  it('reports a failed start, and closes a server created after the builder stopped', async () => {
    const current = context();
    const failing = devServer(
      vi.fn(async () => {
        throw new Error('port in use');
      }),
    );
    failing.close.mockRejectedValueOnce(new Error('close failed'));
    const outputs = await lastValueFrom(
      runViteDevServerBuilder(
        { configFile: 'a' },
        current as never,
        {
          createServer: async () => failing,
        } as unknown as NgDocViteBuilderDependencies,
      ).pipe(take(2), toArray()),
    );
    expect(outputs).toEqual([{ success: false, error: 'port in use' }]);
    await vi.waitFor(() => expect(current.logger.error).toHaveBeenCalledWith('close failed'));

    let created!: (server: ReturnType<typeof devServer>) => void;
    const late = devServer();
    const subscription = runViteDevServerBuilder(
      { configFile: 'a' },
      current as never,
      {
        createServer: () => new Promise((resolve) => (created = resolve)),
      } as unknown as NgDocViteBuilderDependencies,
    ).subscribe();
    subscription.unsubscribe();
    created(late);
    await vi.waitFor(() => expect(late.close).toHaveBeenCalled());
    expect(late.listen).not.toHaveBeenCalled();
  });
});
