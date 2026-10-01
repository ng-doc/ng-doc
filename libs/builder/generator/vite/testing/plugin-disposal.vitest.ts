import { EventEmitter } from 'node:events';
import path from 'node:path';
import type { HmrContext } from 'vite';
import { describe, expect, it, vi } from 'vitest';

import type { BuildResult, BuildSession } from '../../contracts';
import { qualifyAngularPlugins } from '../angular-compatibility';
import { acquireOutputLease } from '../lease';

const bootstrap = vi.hoisted(() => ({ create: vi.fn() }));

vi.mock('../../bootstrap', async (original) => ({
  ...(await original<typeof import('../../bootstrap')>()),
  createGeneratorBuildSession: bootstrap.create,
}));

import { type NgDocVitePluginOptions, createNgDocVitePlugin } from '..';

function pluginOptions(
  workspace: string,
  generator: Partial<NgDocVitePluginOptions['generator']> = {},
): NgDocVitePluginOptions {
  return {
    analogLiveReload: true,
    angularPlugins: qualifyAngularPlugins([
      {
        name: '@analogjs/vite-plugin-angular',
        buildStart() {},
        handleHotUpdate(context: HmrContext) {
          return context.modules;
        },
        transform() {
          return { code: 'class AppComponent {}; AppComponent.ɵcmp = {};', map: null };
        },
      },
    ]),
    angularComponentProbe: path.join(workspace, 'app.component.ts'),
    generator: {
      projectId: 'options',
      workspaceRoot: workspace,
      defaults: {
        docsRoot: path.join(workspace, 'docs'),
        tsConfig: path.join(workspace, 'tsconfig.json'),
        outputRoot: path.join(workspace, 'generated'),
        cacheRoot: path.join(workspace, 'cache'),
      },
      ...generator,
    },
  };
}

function fakeServer(workspace: string) {
  const watcher = Object.assign(new EventEmitter(), { add() {}, unwatch() {}, options: {} });
  const logger = { warn: vi.fn(), error: vi.fn(), info: vi.fn() };
  return {
    watcher,
    httpServer: new EventEmitter(),
    config: { base: '/', root: workspace, logger, server: {} },
    middlewares: { use: vi.fn() },
    ws: { send: vi.fn() },
    environments: {},
    close: async () => {},
  };
}

describe('plugin initialization disposal', () => {
  it('aborts and joins a pending initial build without late publication or a retained lease', async () => {
    const workspace = path.resolve('/tmp/ng-doc-vite-pending');
    const output = path.join(workspace, 'generated');
    let resolveBuild!: (result: BuildResult) => void;
    const build = new Promise<BuildResult>((resolve) => {
      resolveBuild = resolve;
    });
    const dispose = vi.fn(async () => {
      resolveBuild({ status: 'cancelled', generation: 1, diagnostics: [], whyRebuilt: [] });
    });
    bootstrap.create.mockReturnValue({
      buildOnce: vi.fn(() => build),
      dispose,
    } as unknown as BuildSession);
    const [plugin] = createNgDocVitePlugin({
      analogLiveReload: true,
      angularPlugins: qualifyAngularPlugins([
        {
          name: '@analogjs/vite-plugin-angular',
          buildStart() {},
          handleHotUpdate(context: HmrContext) {
            return context.modules;
          },
          transform() {
            return { code: 'class AppComponent {}; AppComponent.ɵcmp = {};', map: null };
          },
        },
      ]),
      angularComponentProbe: path.join(workspace, 'app.component.ts'),
      generator: {
        projectId: 'pending',
        workspaceRoot: workspace,
        defaults: {
          docsRoot: path.join(workspace, 'docs'),
          tsConfig: path.join(workspace, 'tsconfig.json'),
          outputRoot: output,
          cacheRoot: path.join(workspace, 'cache'),
        },
      },
    }) as Array<Record<string, any>>;
    const hookContext = { environment: { name: 'client' } };
    plugin.configResolved({ command: 'build' });
    const initialization = plugin.buildStart.handler();
    await vi.waitFor(() => expect(bootstrap.create).toHaveBeenCalledOnce());
    const earlyUpdate = plugin.hotUpdate.handler.call(hookContext, {
      type: 'update',
      file: '/input.ts',
      read: async () => '',
    });
    const oddAnalogUpdate = plugin.hotUpdate.handler.call(hookContext, {
      type: 'update',
      file: '/input.ts.backup',
      read: async () => '',
    });
    const closing = plugin.closeBundle();
    await vi.waitFor(() => expect(dispose).toHaveBeenCalledOnce());
    await expect(initialization).rejects.toThrow(/cancelled|disposed|generation failed/i);
    await expect(earlyUpdate).rejects.toThrow(/cancelled|disposed|generation failed/i);
    await expect(oddAnalogUpdate).rejects.toThrow(/cancelled|disposed|generation failed/i);
    await closing;
    expect(() => plugin.resolveId('@ng-doc/generated')).toThrow('ADMISSION');
    await expect(
      plugin.hotUpdate.handler.call(hookContext, {
        type: 'update',
        file: '/input.component.scss',
        read: async () => '',
      }),
    ).rejects.toThrow('DISPOSED');
    await expect(
      plugin.hotUpdate.handler.call(hookContext, {
        type: 'create',
        file: '/cache/artifact.json',
        read: async () => '',
      }),
    ).resolves.toBeUndefined();

    const identity = `pending\0${workspace}\0${output}`;
    const reused = acquireOutputLease(identity, output);
    reused.dispose();
  });

  it('rejects the removed virtual content mode before any generator work', () => {
    const workspace = path.resolve('/tmp/ng-doc-vite-virtual');
    bootstrap.create.mockClear();
    expect(() =>
      createNgDocVitePlugin(
        pluginOptions(workspace, {
          developmentContent: 'virtual' as unknown as 'file',
        }),
      ),
    ).toThrow(/^\[NGDOC_DEVELOPMENT_CONTENT_REMOVED\] developmentContent: 'virtual'/);
    expect(() =>
      createNgDocVitePlugin({
        ...pluginOptions(workspace),
        maxContentRequests: 8,
      } as unknown as NgDocVitePluginOptions),
    ).toThrow(/^\[NGDOC_VITE_OPTION_REMOVED\] maxContentRequests was removed/);
    expect(bootstrap.create).not.toHaveBeenCalled();
  });

  it('reports a synchronous initialization failure on the development server', async () => {
    const workspace = path.resolve('/tmp/ng-doc-vite-sync-failure');
    bootstrap.create.mockReset();
    bootstrap.create.mockImplementation(() => {
      throw new TypeError('[NGDOC_TEST_SYNC] bootstrap rejected the options.');
    });
    const [plugin] = createNgDocVitePlugin(pluginOptions(workspace)) as Array<Record<string, any>>;
    await expect(plugin.configureServer(fakeServer(workspace))).rejects.toThrow(
      '[NGDOC_TEST_SYNC] bootstrap rejected the options.',
    );
    expect(bootstrap.create).toHaveBeenCalledOnce();
  });

  it('gives removed virtual module ids a coded error', () => {
    const [plugin] = createNgDocVitePlugin(
      pluginOptions(path.resolve('/tmp/ng-doc-vite-virtual-ids')),
    ) as Array<Record<string, any>>;
    for (const id of ['virtual:ng-doc/content/page', '/@ng-doc/virtual/content/page'])
      expect(() => plugin.resolveId(id)).toThrow(/^\[NGDOC_VIRTUAL_TRANSPORT\] .*was removed/);
  });
});
