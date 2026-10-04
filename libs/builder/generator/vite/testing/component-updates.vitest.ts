import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Connect, Plugin, ViteDevServer } from 'vite';
import { createServer } from 'vite';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createNgDocVitePlugin } from '..';
import { createComponentUpdateGate } from '../component-updates';

const repository = path.resolve(import.meta.dirname, '../../../../..');
const temporary: string[] = [];
const servers: ViteDevServer[] = [];
const cwd = process.cwd();
afterEach(async () => {
  try {
    process.chdir(cwd);
    await Promise.all(servers.splice(0).map((server) => server.close()));
  } finally {
    // Vite's dependency optimizer may still write its fixture cache after the server closed.
    await Promise.all(
      temporary
        .splice(0)
        .map((root) => rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })),
    );
    vi.unstubAllEnvs();
  }
}, 30_000);

describe('component updates after a dependency optimizer reload', () => {
  it('applies no stale metadata after a demo dependency found late reloads the page, and still serves edits', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('VITEST', undefined);
    const fixture = await project();
    // A dev server runs in its workspace: Analog resolves component ids against the working
    // directory, and Angular writes them relative to the workspace root.
    process.chdir(fixture.root);
    const { createNgDocAngularPlugins } = await import(
      pathToFileURL(path.join(repository, 'dist/libs/builder/generator/vite/angular/index.js')).href
    );
    const angularPlugins: Plugin[] = createNgDocAngularPlugins({
      tsconfig: fixture.appTsconfig,
      workspaceRoot: fixture.root,
    });
    const sent: Array<{ type?: string; event?: string; data?: { id: string; timestamp: number } }> =
      [];
    const server = await createServer({
      root: fixture.root,
      // Its own dependency cache (below a node_modules folder, as linters and editors skip).
      cacheDir: path.join(fixture.root, '.vite/node_modules/.vite'),
      configFile: false,
      logLevel: 'silent',
      plugins: [
        plugin(fixture, angularPlugins),
        {
          name: 'hmr-observer',
          configureServer(server: ViteDevServer) {
            for (const channel of new Set([server.ws, server.environments.client.hot])) {
              const send = channel.send as (...args: unknown[]) => unknown;
              (channel as { send: unknown }).send = (...args: unknown[]) => {
                sent.push(
                  typeof args[0] === 'string'
                    ? { type: 'custom', event: args[0], data: args[1] as never }
                    : (args[0] as never),
                );
                return Reflect.apply(send, channel, args);
              };
            }
          },
        },
      ],
      server: { host: '127.0.0.1', port: 0 },
    });
    servers.push(server);
    await server.listen();
    const address = server.httpServer!.address();
    const origin = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
    const get = async (url: string) => {
      const response = await fetch(`${origin}${url}`);
      return { status: response.status, body: await response.text() };
    };

    // The first page load: the entry and its component, whose optimized dependency is served once
    // the dependency optimizer's first run has committed.
    expect((await get('/')).status).toBe(200);
    expect((await get('/src/main.ts')).status).toBe(200);
    const app = await get('/src/app.component.ts');
    const optimized = /["'](\/[^"']*\.vite\/deps\/[^"']+)["']/.exec(app.body)?.[1];
    expect(optimized).toBeDefined();
    expect((await get(optimized!)).status).toBe(200);
    const reloads = () => sent.filter((payload) => payload.type === 'full-reload').length;
    expect(reloads()).toBe(0);

    // A demo opened later: its CDK import and the `@angular/cdk/bidi` import its template adds are
    // dependencies Vite first sees now, so it optimizes again and reloads the page.
    const before = await get('/src/demo.component.ts');
    expect(before.body).toContain('FirstDemo_HmrLoad');
    await waitFor(async () => reloads() > 0, 60_000);
    const demo = server.environments.client.moduleGraph.getModuleById(fixture.demo);
    expect(demo?.lastInvalidationTimestamp).toBeGreaterThan(0);

    // The reloaded page evaluates the demo module, whose HMR code for each component loads its
    // metadata update with the current time. The module is the latest compilation: nothing to apply.
    const reloaded = await get(`/src/demo.component.ts?t=${Date.now()}`);
    const first = /["']([^"']*%40FirstDemo)["']/.exec(reloaded.body)?.[1];
    const second = /["']([^"']*%40SecondDemo)["']/.exec(reloaded.body)?.[1];
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    for (const component of [first!, second!]) {
      const loaded = await get(`/src/@ng/component?c=${component}&t=${Date.now()}`);
      expect(loaded).toEqual({ status: 200, body: '' });
    }
    // Analog's SSR path answers the same load-time request.
    const ssr = server.environments.ssr.pluginContainer;
    const resolved = await ssr.resolveId(
      `${pathToFileURL(path.join(fixture.root, 'src/@ng/component')).href}?c=${first}&t=${Date.now()}`,
    );
    expect(resolved?.id).toContain('/@ng/component');
    expect(await ssr.load(resolved!.id)).toBe('');

    // An edit still reaches the browser: the update event's own request gets the new metadata.
    await writeFile(fixture.demo, demoSource('second demo edited'));
    await waitFor(async () =>
      sent.some(
        (payload) => payload.event === 'angular:component-update' && payload.data!.id === second,
      ),
    );
    const event = sent.find(
      (payload) => payload.event === 'angular:component-update' && payload.data!.id === second,
    )!;
    const update = await get(`/src/@ng/component?c=${event.data!.id}&t=${event.data!.timestamp}`);
    expect(update.status).toBe(200);
    expect(update.body).toContain('SecondDemo_UpdateMetadata');
    expect(update.body).toContain('second demo edited');
    const stale = await get(
      `/src/@ng/component?c=${event.data!.id}&t=${event.data!.timestamp + 1}`,
    );
    expect(stale).toEqual({ status: 200, body: '' });
  }, 120_000);
});

describe('createComponentUpdateGate', () => {
  it('passes only the requests of dispatched update events, on every HMR channel', () => {
    const { gate, ws, hot, middleware } = configured();
    expect(gate).toMatchObject({ name: '@ng-doc/vite:component-updates', apply: 'serve' });
    const component = 'src/demo.ts@Demo';

    expect(
      request(middleware, `/src/@ng/component?c=${encodeURIComponent(component)}&t=1`),
    ).toEqual({
      next: false,
      body: '',
      headers: { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-cache' },
    });
    // Analog's string form on one channel, the payload form on the other: both still reach the
    // channel's own send, with its receiver.
    ws.send('angular:component-update', { id: encodeURIComponent(component), timestamp: 1 });
    hot.send({
      type: 'custom',
      event: 'angular:component-update',
      data: { id: encodeURIComponent(component), timestamp: '2' },
    });
    expect(ws.calls).toEqual([
      ['angular:component-update', { id: encodeURIComponent(component), timestamp: 1 }],
    ]);
    expect(ws.receivers).toEqual([ws]);
    expect(hot.calls).toHaveLength(1);
    expect(hot.receivers).toEqual([hot]);
    for (const timestamp of ['1', '2']) {
      expect(
        request(middleware, `/src/@ng/component?c=${encodeURIComponent(component)}&t=${timestamp}`),
      ).toEqual({ next: true });
    }
    expect(request(middleware, `/src/@ng/component?c=${encodeURIComponent(component)}`).next).toBe(
      false,
    );
    expect(
      request(middleware, `/src/@ng/component?c=${encodeURIComponent('src/demo.ts@Other')}&t=1`)
        .next,
    ).toBe(false);
  });

  it('leaves other requests and payloads to Analog and Vite', () => {
    const { ws, middleware } = configured();
    expect(request(middleware, undefined)).toEqual({ next: true });
    expect(request(middleware, '/src/main.ts')).toEqual({ next: true });
    // Analog answers a request without a component with its own error.
    expect(request(middleware, '/@ng/component?t=1')).toEqual({ next: true });
    for (const [payload, data] of [
      ['angular:other', { id: 'a', timestamp: 1 }],
      [{ type: 'full-reload', path: '*' }, undefined],
      [{ type: 'custom', event: 'angular:component-update', data: null }, undefined],
      [null, undefined],
      ['angular:component-update', { id: 1, timestamp: 1 }],
      ['angular:component-update', { id: 'a', timestamp: {} }],
      ['angular:component-update', { id: '%E0%A4%A', timestamp: 1 }],
    ] as const) {
      ws.send(payload, data);
    }
    expect(ws.calls).toHaveLength(7);
    expect(request(middleware, '/@ng/component?c=a&t=1').next).toBe(false);
  });

  it('keeps the most recent updates only', () => {
    const { ws, middleware } = configured({ separateClientChannel: false });
    for (let timestamp = 0; timestamp <= 256; timestamp++) {
      ws.send('angular:component-update', { id: 'a', timestamp });
    }
    // A re-sent update counts as recent again.
    ws.send('angular:component-update', { id: 'a', timestamp: 1 });
    ws.send('angular:component-update', { id: 'a', timestamp: 257 });
    expect(request(middleware, '/@ng/component?c=a&t=0').next).toBe(false);
    expect(request(middleware, '/@ng/component?c=a&t=2').next).toBe(false);
    for (const timestamp of [1, 3, 256, 257]) {
      expect(request(middleware, `/@ng/component?c=a&t=${timestamp}`).next).toBe(true);
    }
  });

  it("empties Analog's SSR answer to a request no update event made", () => {
    const { gate, ws } = configured();
    const load = (gate.load as { handler: (id: string, options?: { ssr?: boolean }) => unknown })
      .handler;
    const id = '\0file:///workspace/src/@ng/component?c=src%2Fdemo.ts%40Demo&t=5';
    expect(load(id)).toBeUndefined();
    expect(load(id, { ssr: true })).toBe('');
    expect(load('/workspace/src/demo.ts', { ssr: true })).toBeUndefined();
    ws.send('angular:component-update', {
      id: encodeURIComponent('src/demo.ts@Demo'),
      timestamp: 5,
    });
    expect(load(id, { ssr: true })).toBeUndefined();
  });
});

interface FakeChannel {
  calls: unknown[][];
  receivers: unknown[];
  send(...args: unknown[]): void;
}

function channel(): FakeChannel {
  const fake: FakeChannel = {
    calls: [],
    receivers: [],
    send(this: unknown, ...args: unknown[]) {
      fake.calls.push(args);
      fake.receivers.push(this);
    },
  };
  return fake;
}

function configured({ separateClientChannel = true }: { separateClientChannel?: boolean } = {}) {
  const gate = createComponentUpdateGate();
  const ws = channel();
  const hot = channel();
  let middleware: Connect.NextHandleFunction | undefined;
  const server = {
    ws,
    // Vite 5 has no environments.
    ...(separateClientChannel ? { environments: { client: { hot } } } : {}),
    middlewares: { use: (handler: Connect.NextHandleFunction) => (middleware = handler) },
  };
  const hook = gate.configureServer as { order: string; handler: (server: unknown) => void };
  expect(hook.order).toBe('pre');
  hook.handler(server);
  return { gate, ws, hot, middleware: middleware! };
}

function request(middleware: Connect.NextHandleFunction, url: string | undefined) {
  let next = false;
  let body: string | undefined;
  const headers: Record<string, string> = {};
  middleware(
    { url } as Connect.IncomingMessage,
    {
      setHeader: (name: string, value: string) => (headers[name] = value),
      end: (text: string) => (body = text),
    } as never,
    () => (next = true),
  );
  return next ? { next } : { next, body, headers };
}

interface Fixture {
  root: string;
  docs: string;
  output: string;
  cache: string;
  config: string;
  tsconfig: string;
  appTsconfig: string;
  app: string;
  demo: string;
}

async function project(): Promise<Fixture> {
  const runtime = path.join(import.meta.dirname, '.runtime');
  await mkdir(runtime, { recursive: true });
  const root = await mkdtemp(path.join(runtime, 'ng-doc-vite-'));
  temporary.push(root);
  const docs = path.join(root, 'docs');
  const src = path.join(root, 'src');
  const fixture: Fixture = {
    root,
    docs,
    output: path.join(root, 'generated'),
    cache: path.join(root, 'cache'),
    config: path.join(root, 'ng-doc.config.mjs'),
    tsconfig: path.join(root, 'tsconfig.json'),
    appTsconfig: path.join(root, 'tsconfig.app.json'),
    app: path.join(src, 'app.component.ts'),
    demo: path.join(src, 'demo.component.ts'),
  };
  await mkdir(docs, { recursive: true });
  await mkdir(src, { recursive: true });
  await symlink(path.join(repository, 'node_modules'), path.join(root, 'node_modules'), 'dir');
  await writeFile(
    fixture.config,
    `export default { docsPath: 'docs', tsConfig: 'tsconfig.json', routePrefix: '', cache: true };\n`,
  );
  const compilerOptions = {
    target: 'ES2022',
    module: 'ESNext',
    moduleResolution: 'bundler',
    strict: true,
    experimentalDecorators: true,
    skipLibCheck: true,
    types: [],
  };
  await writeFile(fixture.tsconfig, JSON.stringify({ compilerOptions, include: ['docs/**/*.ts'] }));
  // The application program: the entry, the component probe and the demo, not the generated pages.
  await writeFile(
    fixture.appTsconfig,
    JSON.stringify({
      compilerOptions,
      angularCompilerOptions: { strictTemplates: true },
      include: ['src/**/*.ts'],
    }),
  );
  await writeFile(
    path.join(docs, 'ng-doc.page.ts'),
    `const Guide = { title: 'Guide', route: 'guide', mdFile: './guide.md' };\nexport default Guide;\n`,
  );
  await writeFile(path.join(docs, 'guide.md'), '# Guide\nA page.\n');
  await writeFile(
    fixture.app,
    `import { Component } from '@angular/core';\n@Component({ selector: 'fixture-app', template: 'app' })\nexport class AppComponent {}\n`,
  );
  await writeFile(fixture.demo, demoSource('second demo'));
  // The entry does not import the demo, so the dependency scan never sees the demo's imports.
  await writeFile(
    path.join(src, 'main.ts'),
    `import { AppComponent } from './app.component';\nconsole.log(AppComponent);\n`,
  );
  await writeFile(
    path.join(root, 'index.html'),
    '<html><head></head><body><script type="module" src="/src/main.ts"></script></body></html>',
  );
  return fixture;
}

/**
 * Two components in one file, as in libraries that keep a component's parts together. Only the
 * second one's template takes a directive (`Dir`, from `@angular/cdk/bidi`) through an NgModule's
 * exports (`ScrollingModule`), so only its HMR metadata reads a second namespace.
 * @param text - The second component's text.
 */
function demoSource(text: string): string {
  return [
    `import { Component } from '@angular/core';`,
    `import { ScrollingModule } from '@angular/cdk/scrolling';`,
    `@Component({ selector: 'first-demo', template: 'first demo' })`,
    `export class FirstDemo {}`,
    `@Component({ selector: 'second-demo', imports: [ScrollingModule], template: '<div dir="rtl">${text}</div>' })`,
    `export class SecondDemo {}`,
    '',
  ].join('\n');
}

function plugin(fixture: Fixture, angularPlugins: Plugin[]) {
  return createNgDocVitePlugin({
    analogLiveReload: true,
    angularPlugins,
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
      templateRoot: path.join(repository, 'dist/libs/builder/generator/templates'),
      worker: {
        moduleUrl: pathToFileURL(
          path.join(repository, 'dist/libs/builder/generator/compiler/index.js'),
        ),
        workerEntryUrl: pathToFileURL(
          path.join(repository, 'dist/libs/builder/generator/worker/entry.js'),
        ),
      },
      session: { batchDelayMs: 5 },
    },
  });
}

async function waitFor(predicate: () => Promise<boolean>, timeout: number = 20_000): Promise<void> {
  const deadline = Date.now() + timeout;
  while (!(await predicate())) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for the Vite dev server');
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}
