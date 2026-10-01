import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { HmrContext, Plugin, ViteDevServer } from 'vite';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  type AngularCompositionBridge,
  composeAngularPlugins,
  globalStyleSheet,
} from '../angular-composition';
import type { HostUpdateTicket } from '../host-updates';

const temporary: string[] = [];

afterEach(async () => {
  await Promise.all(temporary.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function callable(hook: unknown): (...args: any[]) => any {
  if (typeof hook === 'function') return hook as (...args: any[]) => any;
  return (hook as { handler: (...args: any[]) => any }).handler;
}

function resolvers<T = void>(): {
  promise: Promise<T>;
  resolve(value?: T): void;
  reject(error: unknown): void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve: (value) => resolve(value as T), reject };
}

async function fixtureProbe(): Promise<{ root: string; probe: string }> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ng-doc-angular-composition-'));
  temporary.push(root);
  const probe = path.join(root, 'app #probe.component.ts');
  await mkdir(path.dirname(probe), { recursive: true });
  await writeFile(
    probe,
    `import { Component as C } from '@angular/core';\n@C({selector: 'probe-app', template: 'probe'})\nexport class ProbeComponent {}\n`,
  );
  return { root, probe };
}

function ticket(id: number): HostUpdateTicket {
  return { ready: Promise.resolve(), token: { id } };
}

function context(file: string, server: ViteDevServer): HmrContext {
  return {
    file,
    timestamp: Date.now(),
    modules: [],
    read: () => readFile(file, 'utf8'),
    server,
  };
}

describe('Analog Angular composition ownership', () => {
  it('keeps a diagnosed compiler admission recoverable while arbitrary hook errors remain fatal', async () => {
    const { probe } = await fixtureProbe();
    const diagnostic = Object.assign(new Error('invalid template'), {
      code: 'NGDOC_ANALOG_COMPILATION_DIAGNOSTIC',
    });
    let nextError: Error | undefined = diagnostic;
    let sequence = 0;
    const bridge: AngularCompositionBridge = {
      initialize: vi.fn(async () => {}),
      start: vi.fn(() => ticket(++sequence)),
      acknowledge: vi.fn(async () => {}),
      diagnostic: vi.fn(),
      committed: vi.fn(async () => {}),
      settle: vi.fn(async () => {}),
      fail: vi.fn(),
    };
    const compiler: Plugin = {
      name: '@analogjs/vite-plugin-angular',
      buildStart() {},
      handleHotUpdate() {
        if (nextError) throw nextError;
        return [];
      },
      transform() {
        return { code: 'class App {}; App.ɵcmp = {};', map: null };
      },
    };
    const composition = composeAngularPlugins([compiler], probe, bridge);
    const wrapped = composition.plugins[0]!;
    const server = {
      environments: {
        client: {
          moduleGraph: { ensureEntryFromUrl: async () => ({}), invalidateModule() {} },
          transformRequest: async () => callable(wrapped.transform)('', probe),
        },
      },
    } as unknown as ViteDevServer;
    composition.attachServer(server);
    await callable(wrapped.buildStart)();
    await composition.preflight();
    const hot = callable(wrapped.handleHotUpdate);
    await expect(hot(context(probe, server))).rejects.toBe(diagnostic);
    expect(bridge.diagnostic).toHaveBeenCalledWith(expect.anything(), diagnostic);
    expect(bridge.fail).not.toHaveBeenCalled();
    expect(bridge.acknowledge).not.toHaveBeenCalled();
    nextError = undefined;
    await hot(context(probe, server));
    expect(bridge.acknowledge).toHaveBeenLastCalledWith(expect.anything(), false, true);
    nextError = new Error('arbitrary compiler fault');
    await expect(hot(context(probe, server))).rejects.toBe(nextError);
    nextError = undefined;
    await expect(hot(context(probe, server))).rejects.toThrow('RESTART_REQUIRED');
    expect(bridge.fail).toHaveBeenCalledOnce();
    await composition.dispose();
  });

  it('preserves hook calls, serializes compiler admission and witnesses resources before settlement', async () => {
    const { probe } = await fixtureProbe();
    const entries: string[] = [];
    const originalThis: unknown[] = [];
    const firstHook = resolvers();
    const firstSettlement = resolvers();
    let id = 0;
    let firstTicket: HostUpdateTicket | undefined;
    const acknowledge = vi.fn(async () => {});
    const committed = vi.fn(async () => {});
    const settle = vi.fn(async (value: HostUpdateTicket) => {
      if (value === firstTicket) await firstSettlement.promise;
    });
    const bridge: AngularCompositionBridge = {
      initialize: vi.fn(async () => {}),
      start: vi.fn(() => {
        const value = ticket(++id);
        firstTicket ??= value;
        return value;
      }),
      acknowledge,
      committed,
      settle,
      fail: vi.fn(),
      diagnostic: vi.fn(),
    };
    const compiler: Plugin = {
      name: '@analogjs/vite-plugin-angular',
      buildStart() {},
      async handleHotUpdate(value: HmrContext) {
        originalThis.push(this);
        entries.push(value.file);
        if (value.file.endsWith('first.ts')) await firstHook.promise;
        return value.modules;
      },
      transform: {
        filter: { id: /\.ts$/ },
        handler(_code: string, transformId: string) {
          if (path.resolve(transformId.replace(/\?.*$/, '')) !== path.resolve(probe)) return;
          return {
            code: 'export class ProbeComponent {}; ProbeComponent.ɵcmp = {};',
            map: null,
          };
        },
      },
    };
    const companion: Plugin = { name: 'angular-factory-companion' };
    const composition = composeAngularPlugins([compiler, companion], probe, bridge);
    const wrapped = composition.plugins[0]!;
    const transform = callable(wrapped.transform);
    const urls: string[] = [];
    const node = {};
    const client = {
      depsOptimizer: {
        init: vi.fn(async () => {
          urls.push('optimizer-init');
        }),
      },
      moduleGraph: {
        ensureEntryFromUrl: vi.fn(async (url: string) => {
          urls.push(url);
          return node;
        }),
        invalidateModule: vi.fn(),
      },
      transformRequest: vi.fn(async () =>
        transform.call({ marker: 'transform-context' }, await readFile(probe, 'utf8'), probe),
      ),
    };
    const server = { environments: { client } } as unknown as ViteDevServer;
    composition.attachServer(server);
    await callable(wrapped.buildStart).call({ marker: 'build-context' });
    await composition.preflight();
    expect(urls[0]).toBe('optimizer-init');
    expect(urls[1]).toContain('%23probe.component.ts');
    expect(composition.plugins[1]).toBe(companion);

    const hot = callable(wrapped.handleHotUpdate);
    const hookThis = { marker: 'hot-context' };
    const first = hot.call(hookThis, context(path.join(path.dirname(probe), 'first.ts'), server));
    await vi.waitFor(() => expect(entries).toHaveLength(1));
    const second = hot.call(hookThis, context(path.join(path.dirname(probe), 'second.ts'), server));
    await Promise.resolve();
    expect(entries).toHaveLength(1);
    firstHook.resolve();
    await vi.waitFor(() => expect(entries).toHaveLength(2));
    expect(settle).toHaveBeenCalledTimes(2);
    firstSettlement.resolve();
    await Promise.all([first, second]);
    expect(originalThis).toEqual([hookThis, hookThis]);

    const transformsBeforeResource = client.transformRequest.mock.calls.length;
    const resource = path.join(path.dirname(probe), 'probe.component.html');
    await writeFile(resource, 'changed');
    await hot.call(hookThis, context(resource, server));
    expect(committed).toHaveBeenCalledOnce();
    expect(client.transformRequest.mock.calls.length).toBe(transformsBeforeResource + 1);
    expect(acknowledge).toHaveBeenLastCalledWith(expect.anything(), true, true);
    expect(settle).toHaveBeenCalledTimes(3);
    await composition.dispose();
  });

  it('leaves a global style sheet to Vite instead of recompiling its virtual importer', async () => {
    const { probe, root } = await fixtureProbe();
    const compilerHot = vi.fn((value: HmrContext) => value.modules);
    const bridge: AngularCompositionBridge = {
      initialize: vi.fn(async () => {}),
      start: vi.fn(() => ticket(1)),
      acknowledge: vi.fn(async () => {}),
      diagnostic: vi.fn(),
      committed: vi.fn(async () => {}),
      settle: vi.fn(async () => {}),
      fail: vi.fn(),
    };
    const compiler: Plugin = {
      name: '@analogjs/vite-plugin-angular',
      buildStart() {},
      handleHotUpdate: compilerHot,
      transform() {
        return { code: 'class App {}; App.ɵcmp = {};', map: null };
      },
    };
    const composition = composeAngularPlugins([compiler], probe, bridge);
    const wrapped = composition.plugins[0]!;
    const server = {
      environments: {
        client: {
          moduleGraph: { ensureEntryFromUrl: async () => ({}), invalidateModule() {} },
          transformRequest: async () => callable(wrapped.transform)('', probe),
        },
      },
    } as unknown as ViteDevServer;
    composition.attachServer(server);
    await callable(wrapped.buildStart)();
    await composition.preflight();

    const sheet = path.join(root, 'styles.scss');
    const modules = [
      { id: sheet, importers: new Set([{ id: '\0ng-doc-application:browser' }]) },
    ] as unknown as HmrContext['modules'];
    const result = await callable(wrapped.handleHotUpdate)({
      ...context(sheet, server),
      modules,
    });

    expect(result).toBe(modules);
    expect(compilerHot).not.toHaveBeenCalled();
    expect(bridge.committed).not.toHaveBeenCalled();
    expect(bridge.acknowledge).toHaveBeenCalledWith(expect.anything(), false);
    expect(bridge.settle).toHaveBeenCalledOnce();
    expect(bridge.fail).not.toHaveBeenCalled();
    await composition.dispose();
  });

  it('poisons a throwing compiler and joins disposal while a later admission is queued', async () => {
    const { probe } = await fixtureProbe();
    const held = resolvers();
    let throwNext = true;
    const bridge: AngularCompositionBridge = {
      initialize: vi.fn(async () => {}),
      start: vi.fn(() => ticket(1)),
      acknowledge: vi.fn(async () => {}),
      committed: vi.fn(async () => {}),
      settle: vi.fn(async () => {}),
      fail: vi.fn(),
      diagnostic: vi.fn(),
    };
    const compiler: Plugin = {
      name: '@analogjs/vite-plugin-angular',
      buildStart() {},
      async handleHotUpdate(value: HmrContext) {
        if (throwNext) {
          throwNext = false;
          throw new Error('injected compiler hook failure');
        }
        await held.promise;
        return value.modules;
      },
      transform: () => ({
        code: 'export class ProbeComponent {}; ProbeComponent.ɵcmp = {};',
        map: null,
      }),
    };
    const composition = composeAngularPlugins([compiler], probe, bridge);
    const wrapped = composition.plugins[0]!;
    const transform = callable(wrapped.transform);
    const client = {
      moduleGraph: {
        ensureEntryFromUrl: vi.fn(async () => ({})),
        invalidateModule: vi.fn(),
      },
      transformRequest: vi.fn(async () => transform.call({}, await readFile(probe, 'utf8'), probe)),
    };
    const server = { environments: { client } } as unknown as ViteDevServer;
    composition.attachServer(server);
    await callable(wrapped.buildStart).call({});
    await composition.preflight();
    const hot = callable(wrapped.handleHotUpdate);
    await expect(
      hot.call({}, context(path.join(path.dirname(probe), 'bad.ts'), server)),
    ).rejects.toThrow('injected compiler hook failure');
    expect(bridge.fail).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('recreate Vite') }),
    );
    await expect(
      hot.call({}, context(path.join(path.dirname(probe), 'after.ts'), server)),
    ).rejects.toThrow('RESTART_REQUIRED');
    await composition.dispose();

    let healthyEntries = 0;
    const healthy = composeAngularPlugins(
      [
        {
          ...compiler,
          async handleHotUpdate(value: HmrContext) {
            healthyEntries += 1;
            await held.promise;
            return value.modules;
          },
        },
      ],
      probe,
      bridge,
    );
    const healthyCompiler = healthy.plugins[0]!;
    const healthyTransform = callable(healthyCompiler.transform);
    const healthyClient = {
      moduleGraph: {
        ensureEntryFromUrl: vi.fn(async () => ({})),
        invalidateModule: vi.fn(),
      },
      transformRequest: vi.fn(async () =>
        healthyTransform.call({}, await readFile(probe, 'utf8'), probe),
      ),
    };
    const healthyServer = { environments: { client: healthyClient } } as unknown as ViteDevServer;
    healthy.attachServer(healthyServer);
    await callable(healthyCompiler.buildStart).call({});
    await healthy.preflight();
    const healthyHot = callable(healthyCompiler.handleHotUpdate);
    const active = healthyHot.call(
      {},
      context(path.join(path.dirname(probe), 'active.ts'), healthyServer),
    );
    await vi.waitFor(() => expect(healthyEntries).toBe(1));
    const queued = healthyHot.call(
      {},
      context(path.join(path.dirname(probe), 'queued.ts'), healthyServer),
    );
    await vi.waitFor(() => expect(bridge.start).toHaveBeenCalled());
    const closing = healthy.dispose();
    await expect(queued).rejects.toThrow('DISPOSED');
    held.resolve();
    await active;
    await closing;
  });

  it('acknowledges a resource against last-good before propagating generation failure', async () => {
    const { probe } = await fixtureProbe();
    const order: string[] = [];
    const bridge: AngularCompositionBridge = {
      initialize: vi.fn(async () => {}),
      start: vi.fn(() => ticket(1)),
      committed: vi.fn(async () => {
        order.push('atomic-boundary');
      }),
      acknowledge: vi.fn(async (_ticket, resourceWitness) => {
        expect(resourceWitness).toBe(true);
        order.push('acknowledge');
      }),
      settle: vi.fn(async () => {
        order.push('settle');
        throw new Error('resource generation failed');
      }),
      fail: vi.fn(),
      diagnostic: vi.fn(),
    };
    const compiler: Plugin = {
      name: '@analogjs/vite-plugin-angular',
      buildStart() {},
      handleHotUpdate(value: HmrContext) {
        order.push('angular-hook');
        return value.modules;
      },
      transform: () => {
        order.push('probe');
        return {
          code: 'export class ProbeComponent {}; ProbeComponent.ɵcmp = {};',
          map: null,
        };
      },
    };
    const composition = composeAngularPlugins([compiler], probe, bridge);
    const wrapped = composition.plugins[0]!;
    const transform = callable(wrapped.transform);
    const client = {
      moduleGraph: {
        ensureEntryFromUrl: vi.fn(async () => ({})),
        invalidateModule: vi.fn(),
      },
      transformRequest: vi.fn(async () => transform.call({}, await readFile(probe, 'utf8'), probe)),
    };
    const server = { environments: { client } } as unknown as ViteDevServer;
    composition.attachServer(server);
    await callable(wrapped.buildStart).call({});
    await composition.preflight();
    order.length = 0;
    const resource = path.join(path.dirname(probe), 'probe.component.html');
    await writeFile(resource, 'changed');
    await expect(
      callable(wrapped.handleHotUpdate).call({}, context(resource, server)),
    ).rejects.toThrow('resource generation failed');
    expect(order).toEqual(['atomic-boundary', 'angular-hook', 'probe', 'acknowledge', 'settle']);
    expect(bridge.fail).not.toHaveBeenCalled();
    await composition.dispose();
  });

  it('fails preflight when a fresh traversal does not emit the configured component', async () => {
    const { probe } = await fixtureProbe();
    const bridge: AngularCompositionBridge = {
      initialize: vi.fn(async () => {}),
      start: vi.fn(() => ticket(1)),
      acknowledge: vi.fn(async () => {}),
      committed: vi.fn(async () => {}),
      settle: vi.fn(async () => {}),
      fail: vi.fn(),
      diagnostic: vi.fn(),
    };
    const composition = composeAngularPlugins(
      [
        {
          name: '@analogjs/vite-plugin-angular',
          buildStart() {},
          handleHotUpdate(value: HmrContext) {
            return value.modules;
          },
          transform: () => undefined,
        },
      ],
      probe,
      bridge,
    );
    const client = {
      moduleGraph: {
        ensureEntryFromUrl: vi.fn(async () => ({})),
        invalidateModule: vi.fn(),
      },
      transformRequest: vi.fn(async () => ({ code: 'plain output', map: null })),
    };
    composition.attachServer({ environments: { client } } as unknown as ViteDevServer);
    await callable(composition.plugins[0]!.buildStart).call({});
    await expect(composition.preflight()).rejects.toThrow(/ANGULAR_RESTART_REQUIRED.*probe/i);
    expect(bridge.fail).toHaveBeenCalledOnce();
    await composition.dispose();
  });

  it('does not finish disposal while a public preflight transform is still running', async () => {
    const { probe } = await fixtureProbe();
    const transformEntered = resolvers();
    const releaseTransform = resolvers();
    const bridge: AngularCompositionBridge = {
      initialize: vi.fn(async () => {}),
      start: vi.fn(() => ticket(1)),
      acknowledge: vi.fn(async () => {}),
      committed: vi.fn(async () => {}),
      settle: vi.fn(async () => {}),
      fail: vi.fn(),
      diagnostic: vi.fn(),
    };
    const composition = composeAngularPlugins(
      [
        {
          name: '@analogjs/vite-plugin-angular',
          buildStart() {},
          handleHotUpdate(value: HmrContext) {
            return value.modules;
          },
          transform: () => ({
            code: 'export class ProbeComponent {}; ProbeComponent.ɵcmp = {};',
            map: null,
          }),
        },
      ],
      probe,
      bridge,
    );
    const wrappedTransform = callable(composition.plugins[0]!.transform);
    const client = {
      moduleGraph: {
        ensureEntryFromUrl: vi.fn(async () => ({})),
        invalidateModule: vi.fn(),
      },
      transformRequest: vi.fn(async () => {
        transformEntered.resolve();
        await releaseTransform.promise;
        return wrappedTransform.call({}, await readFile(probe, 'utf8'), probe);
      }),
    };
    composition.attachServer({ environments: { client } } as unknown as ViteDevServer);
    await callable(composition.plugins[0]!.buildStart).call({});
    const preflight = composition.preflight();
    await transformEntered.promise;
    let disposed = false;
    const closing = composition.dispose().then(() => {
      disposed = true;
    });
    await Promise.resolve();
    expect(disposed).toBe(false);
    releaseTransform.resolve();
    await expect(preflight).rejects.toThrow('DISPOSED');
    await closing;
    expect(bridge.fail).not.toHaveBeenCalled();
  });

  it('does not enter the probe when disposal wins dependency-optimizer initialization', async () => {
    const { probe } = await fixtureProbe();
    const optimizerEntered = resolvers();
    const releaseOptimizer = resolvers();
    const bridge: AngularCompositionBridge = {
      initialize: vi.fn(async () => {}),
      start: vi.fn(() => ticket(1)),
      acknowledge: vi.fn(async () => {}),
      committed: vi.fn(async () => {}),
      settle: vi.fn(async () => {}),
      fail: vi.fn(),
      diagnostic: vi.fn(),
    };
    const composition = composeAngularPlugins(
      [
        {
          name: '@analogjs/vite-plugin-angular',
          buildStart() {},
          handleHotUpdate(value: HmrContext) {
            return value.modules;
          },
          transform: () => ({
            code: 'export class ProbeComponent {}; ProbeComponent.ɵcmp = {};',
            map: null,
          }),
        },
      ],
      probe,
      bridge,
    );
    const client = {
      depsOptimizer: {
        async init() {
          optimizerEntered.resolve();
          await releaseOptimizer.promise;
        },
      },
      moduleGraph: {
        ensureEntryFromUrl: vi.fn(async () => ({})),
        invalidateModule: vi.fn(),
      },
      transformRequest: vi.fn(),
    };
    composition.attachServer({ environments: { client } } as unknown as ViteDevServer);
    await callable(composition.plugins[0]!.buildStart).call({});
    const preflight = composition.preflight();
    await optimizerEntered.promise;
    const closing = composition.dispose();
    releaseOptimizer.resolve();
    await expect(preflight).rejects.toThrow('DISPOSED');
    await closing;
    expect(client.moduleGraph.ensureEntryFromUrl).not.toHaveBeenCalled();
    expect(client.transformRequest).not.toHaveBeenCalled();
    expect(bridge.fail).not.toHaveBeenCalled();
  });
});

describe('globalStyleSheet', () => {
  interface Node {
    id: string | null;
    url: string;
    importers: Set<Node>;
  }
  const node = (id: string | null, importers: Node[] = [], url: string = id ?? ''): Node => ({
    id,
    url,
    importers: new Set(importers),
  });
  const check = (file: string, modules: Node[]) =>
    globalStyleSheet({ file, modules: modules as never });
  const browser = node('\0ng-doc-application:browser');

  it('matches a style sheet imported only by virtual modules', () => {
    expect(check('/app/src/styles.scss', [node('/app/src/styles.scss', [browser])])).toBe(true);
  });

  it('matches a Sass file that only global style sheets use, at any depth', () => {
    const sheet = node('/app/src/styles.scss', [browser]);
    const global = node('/libs/styles/global.scss', [sheet]);
    // A dependency node of Sass has no id of its own, only its URL.
    const partial = node(null, [global, sheet], '/@fs/libs/styles/_mixins.scss');

    expect(check('/libs/styles/global.scss', [global])).toBe(true);
    expect(check('/libs/styles/_mixins.scss', [partial])).toBe(true);
  });

  it('leaves component sheets, the files they use and other files to the compiler', () => {
    const component = '/app/src/app.component.scss';
    const served = node(`${component}?direct&ngcomp=ng-c1&e=0`, [browser]);
    const sheet = node('/app/src/styles.scss', [browser]);

    // A component sheet, served for a component or imported by its TypeScript file.
    expect(check(component, [served])).toBe(false);
    expect(check(component, [node(component, [node('/app/src/app.ts')])])).toBe(false);
    // A partial used by a component sheet as well as by the global sheet.
    expect(check('/libs/_mixins.scss', [node('/libs/_mixins.scss', [sheet, served])])).toBe(false);
    // A sheet nothing imports yet, a sheet without modules, a sheet with no virtual importer
    // anywhere (an import cycle), and a script.
    expect(check(component, [node(component)])).toBe(false);
    expect(check(component, [])).toBe(false);
    const first = node('/a.scss');
    const second = node('/b.scss', [first]);
    first.importers.add(second);
    expect(check('/a.scss', [first])).toBe(false);
    expect(check('/app/src/main.ts', [node('/app/src/main.ts', [browser])])).toBe(false);
  });
});
