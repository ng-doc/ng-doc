import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { heapArguments, prerenderNgDoc } from '../prerender';
import {
  type PrerenderRequest,
  documentBase,
  localFetch,
  routeFile,
  routeWarningsToStderr,
  runPrerender,
  runPrerenderChild,
} from '../prerender-runtime';
import { enumerateRoutes } from '../route-inventory';

const temporary: string[] = [];
const invoke = (factory: () => unknown) => factory();

afterEach(async () => {
  await Promise.all(temporary.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function directory(): Promise<string> {
  const runtime = path.join(import.meta.dirname, '.runtime');
  await mkdir(runtime, { recursive: true });
  const root = await mkdtemp(path.join(runtime, 'ng-doc-prerender-'));
  temporary.push(root);
  return root;
}

describe('enumerateRoutes', () => {
  it('enumerates nested, lazy, redirect, default and fullscreen component routes', async () => {
    const result = await enumerateRoutes(
      [
        {
          path: '',
          component: class Shell {},
          children: [
            { path: '', component: class Home {} },
            {
              path: 'guide',
              component: class Guide {},
              children: [
                { path: 'intro', component: class Intro {} },
                { path: 'old', redirectTo: 'intro' },
              ],
            },
            { path: 'demos', children: [{ path: 'full-screen', component: class Full {} }] },
            {
              path: 'lazy',
              loadChildren: () =>
                Promise.resolve({
                  default: [{ path: 'page', loadComponent: () => Promise.resolve(class Lazy {}) }],
                }),
            },
          ],
        },
      ],
      { invoke },
    );
    expect(result).toEqual({
      routes: [
        { path: '/' },
        { path: '/demos/full-screen' },
        { path: '/guide' },
        { path: '/guide/intro' },
        { path: '/guide/old', redirectTo: '/guide/intro' },
        { path: '/lazy/page' },
      ],
      excluded: [],
    });
  });

  it('discovers an added entry without a baseline list', async () => {
    const config: unknown[] = [{ path: 'before', component: class Before {} }];
    expect((await enumerateRoutes(config, { invoke })).routes).toEqual([{ path: '/before' }]);
    config.push({ path: 'added', component: class Added {} });
    expect((await enumerateRoutes(config, { invoke })).routes.map(({ path }) => path)).toEqual([
      '/added',
      '/before',
    ]);
  });

  it('propagates lazy failures and rejects unsupported lazy results and arguments', async () => {
    await expect(
      enumerateRoutes([{ path: 'bad', loadChildren: () => ({ routes: [] }) }], { invoke }),
    ).rejects.toThrow(/Routes array/);
    await expect(
      enumerateRoutes([{ path: 'observable', loadChildren: () => ({ subscribe() {} }) }], {
        invoke,
      }),
    ).rejects.toThrow(/Observable/);
    await expect(
      enumerateRoutes([{ path: 'lazy', loadChildren: () => [{ path: 'x', component: 1 }] }], {
        invoke,
      }),
    ).resolves.toEqual({ routes: [{ path: '/lazy/x' }], excluded: [] });
    await expect(
      enumerateRoutes(
        [{ path: 'broken', loadChildren: () => Promise.reject(new Error('lazy broke')) }],
        { invoke },
      ),
    ).rejects.toThrow(/lazy broke/);
    await expect(enumerateRoutes('x' as never, { invoke })).rejects.toThrow(/Routes array/);
    await expect(enumerateRoutes([], { invoke: 1 as never })).rejects.toThrow(/invoke/);
  });

  it('reports cycles, parameters, wildcards, matchers and other outlets as excluded', async () => {
    const looping: unknown[] = [];
    looping.push({ path: '', children: looping });
    const result = await enumerateRoutes(
      [
        null,
        { path: 'static', component: class Static {} },
        { path: 'users/:id', component: class User {} },
        { path: '**', component: class NotFound {} },
        { matcher: () => null, component: class Matched {} },
        { component: class NoPath {} },
        { path: 'aux', outlet: 'side', component: class Side {} },
        { outlet: 'side', component: class SideRoot {} },
        { path: 'legacy', redirectTo: () => '/new' },
        { path: 'primary', outlet: 'primary', component: class Primary {} },
        ...looping,
      ],
      { invoke },
    );
    expect(result).toEqual({
      routes: [{ path: '/primary' }, { path: '/static' }],
      excluded: [
        { path: '/', reason: 'cycle' },
        { path: '/', reason: 'matcher' },
        { path: '/', reason: 'missing-path' },
        { path: '/', reason: 'non-primary-outlet' },
        { path: '/**', reason: 'wildcard' },
        { path: '/aux', reason: 'non-primary-outlet' },
        { path: '/legacy', reason: 'function-redirect' },
        { path: '/users/:id', reason: 'parameter' },
      ],
    });
  });

  it('keeps the first terminal of a URL, children of same-prefix branches and resolves redirects', async () => {
    const result = await enumerateRoutes(
      [
        { path: '', redirectTo: 'home', pathMatch: 'full' },
        { path: '', component: class DuplicateDefault {} },
        { path: 'home', component: class Home {} },
        { path: 'home', redirectTo: 'elsewhere' },
        { path: 'guide', children: [{ path: 'one', component: class One {} }] },
        { path: 'guide', children: [{ path: 'two', component: class Two {} }] },
        { path: 'docs', children: [{ path: '', redirectTo: './a/../getting-started' }] },
        { path: 'abs', redirectTo: '/home' },
        { path: 'abs', children: [{ path: '', redirectTo: '/home' }] },
      ],
      { invoke },
    );
    expect(result).toEqual({
      routes: [
        { path: '/', redirectTo: '/home' },
        { path: '/abs', redirectTo: '/home' },
        { path: '/docs', redirectTo: '/docs/getting-started' },
        { path: '/guide/one' },
        { path: '/guide/two' },
        { path: '/home' },
      ],
      excluded: [
        { path: '/', reason: 'shadowed' },
        { path: '/home', reason: 'shadowed' },
      ],
    });
  });
});

describe('prerender runtime', () => {
  it('derives the request base from the document and validates route files', () => {
    expect(documentBase('<html><head><base href="/preview"></head></html>')).toBe('/preview/');
    expect(documentBase("<base data-x href='/docs/'>")).toBe('/docs/');
    expect(documentBase('<base href="./">')).toBe('/');
    expect(documentBase('<html></html>')).toBe('/');
    expect(routeFile('/')).toBe('index.html');
    expect(routeFile('/docs/a')).toBe('docs/a/index.html');
    for (const route of ['docs', '/a/../b', '/a?x', '/a#b', '/a\\b', '/./a']) {
      expect(() => routeFile(route)).toThrow(/NGDOC_PRERENDER_ROUTE/);
    }
  });

  function server(options: { fail?: string; config?: unknown } = {}) {
    const rendered: Array<{ url: string; document: string }> = [];
    const injector = {
      get: (token: unknown) => (token === Router ? { config: options.config } : undefined),
    };
    class Router {}
    const module = {
      Router,
      runInInjectionContext: vi.fn((_injector: unknown, fn: () => unknown) => fn()),
      bootstrap: vi.fn(async () => ({ injector })),
      renderApplication: vi.fn(
        async (
          bootstrap: (context: unknown) => Promise<unknown>,
          request: { document: string; url: string; allowedHosts?: string[] },
        ) => {
          await bootstrap({});
          if (options.fail && request.url.endsWith(options.fail)) throw new Error('render broke');
          rendered.push({ url: request.url, document: request.document });
          return `<html>${request.url}</html>`;
        },
      ),
    };
    return { module, rendered, importModule: vi.fn(async () => module) };
  }

  async function built(document: string = '<html><head><base href="/preview/"></head></html>') {
    const root = await directory();
    const browserDir = path.join(root, 'browser');
    await mkdir(browserDir, { recursive: true });
    await writeFile(path.join(browserDir, 'index.html'), document);
    return { root, browserDir };
  }

  it('renders every discovered and explicit route into the browser output and keeps the shell', async () => {
    const { browserDir } = await built();
    const fake = server({
      config: [
        { path: '', component: class Home {} },
        { path: 'docs', loadChildren: () => [{ path: 'a', component: class A {} }] },
        { path: 'users/:id', component: class User {} },
      ],
    });
    const request: PrerenderRequest = {
      browserDir,
      serverEntry: path.join(browserDir, '../server/server.mjs'),
      routes: ['users/1/', '/docs/a'],
      discoverRoutes: true,
    };
    const report = await runPrerender(request, { importModule: fake.importModule });
    expect(fake.importModule).toHaveBeenCalledWith(expect.stringMatching(/^file:.*server\.mjs$/));
    expect(fake.module.runInInjectionContext).toHaveBeenCalledTimes(1);
    expect(report).toEqual({
      routes: [
        { path: '/', file: 'index.html' },
        { path: '/docs/a', file: 'docs/a/index.html' },
        { path: '/users/1', file: 'users/1/index.html' },
      ],
      excluded: [{ path: '/users/:id', reason: 'parameter' }],
      shell: 'index.csr.html',
      errors: [],
    });
    expect(fake.rendered.map(({ url }) => url)).toEqual([
      'http://localhost/preview/',
      'http://localhost/preview/',
      'http://localhost/preview/docs/a',
      'http://localhost/preview/users/1',
    ]);
    expect(fake.module.renderApplication.mock.calls[1][1].allowedHosts).toEqual(['localhost']);
    expect(await readFile(path.join(browserDir, 'docs/a/index.html'), 'utf8')).toBe(
      '<html>http://localhost/preview/docs/a</html>',
    );
    expect(await readFile(path.join(browserDir, 'index.csr.html'), 'utf8')).toContain('<base');
    expect(await readFile(path.join(browserDir, 'index.html'), 'utf8')).toBe(
      '<html>http://localhost/preview/</html>',
    );

    // A second run renders into the kept shell, not into the prerendered `/`.
    const again = server({ config: [] });
    await runPrerender({ ...request, routes: ['/'] }, { importModule: again.importModule });
    expect(again.rendered[0].document).toContain('<base href="/preview/">');
  });

  it('renders the demo pages into the demo application page, falling back to it on a failure', async () => {
    const { browserDir } = await built();
    await writeFile(
      path.join(browserDir, 'ng-doc-demo.html'),
      '<html><head><base href="/preview/"></head><body><ng-doc-demo-app></ng-doc-demo-app></body></html>',
    );
    const docs = server({ config: [{ path: 'docs', component: class Docs {} }] });
    const demo = server({
      fail: '/Broken',
      config: [
        {
          path: 'demo-preview/docs',
          loadChildren: () => [
            { path: '', redirectTo: 'Button', pathMatch: 'full' },
            { path: 'Button', component: class Button {} },
            { path: 'Broken', component: class Broken {} },
          ],
        },
        // Taken by the documentation already: never rendered twice.
        { path: 'docs', component: class Docs {} },
        { path: '**', component: class Unknown {} },
      ],
    });
    const serverEntry = path.join(browserDir, '../server/server.mjs');
    const demoServerEntry = path.join(browserDir, '../server/demo-server.mjs');
    const report = await runPrerender(
      { browserDir, serverEntry, demoServerEntry, routes: [], discoverRoutes: true },
      {
        importModule: async (url: string) =>
          url.endsWith('demo-server.mjs') ? demo.module : docs.module,
      },
    );
    expect(report.routes).toEqual([
      { path: '/demo-preview/docs/Broken', file: 'demo-preview/docs/Broken/index.html' },
      { path: '/demo-preview/docs/Button', file: 'demo-preview/docs/Button/index.html' },
      { path: '/docs', file: 'docs/index.html' },
    ]);
    expect(report.warnings).toEqual([
      {
        route: '/demo-preview/docs/Broken',
        message: expect.stringMatching(/^\[NGDOC_PRERENDER_DEMO_FALLBACK\].*render broke/),
      },
    ]);
    // The demo pages render into their own page, never into the documentation's.
    expect(demo.rendered.every(({ document }) => document.includes('<ng-doc-demo-app>'))).toBe(
      true,
    );
    expect(
      await readFile(path.join(browserDir, 'demo-preview/docs/Button/index.html'), 'utf8'),
    ).toBe('<html>http://localhost/preview/demo-preview/docs/Button</html>');
    // A demo that fails gets the client page, which renders it in the browser.
    expect(
      await readFile(path.join(browserDir, 'demo-preview/docs/Broken/index.html'), 'utf8'),
    ).toContain('<ng-doc-demo-app></ng-doc-demo-app>');
  });

  it('warns instead of failing when the demo application cannot render at all', async () => {
    const { browserDir } = await built();
    const docs = server({ config: [{ path: 'docs', component: class Docs {} }] });
    const serverEntry = path.join(browserDir, '../server/server.mjs');
    // No demo application page in the browser output.
    const report = await runPrerender(
      {
        browserDir,
        serverEntry,
        demoServerEntry: path.join(browserDir, '../server/demo-server.mjs'),
        routes: [],
        discoverRoutes: true,
      },
      { importModule: async () => docs.module },
    );
    expect(report.routes.map((route) => route.path)).toEqual(['/docs']);
    expect(report.warnings).toEqual([
      {
        route: '/ng-doc-demo.html',
        message: expect.stringContaining('[NGDOC_PRERENDER_DEMO_APPLICATION]'),
      },
    ]);
    // Without demo pages the report has no warnings at all.
    expect(
      await runPrerender(
        { browserDir, serverEntry, routes: [], discoverRoutes: true },
        { importModule: async () => docs.module },
      ),
    ).not.toHaveProperty('warnings');
  });

  it('answers requests for the prerender host from the browser output', async () => {
    const { browserDir } = await built();
    await mkdir(path.join(browserDir, 'assets/ng-doc'), { recursive: true });
    await writeFile(path.join(browserDir, 'assets/ng-doc/indexes.json'), '[1]');
    await writeFile(path.join(browserDir, 'assets/raw.bin'), 'raw');
    const fallback = vi.fn(async () => new Response('remote'));
    const local = localFetch(browserDir, '/preview/', fallback as unknown as typeof fetch);
    const hit = await local('http://localhost/preview/assets/ng-doc/indexes.json?v=1');
    expect(hit.status).toBe(200);
    expect(hit.headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect(await hit.json()).toEqual([1]);
    expect(
      (await local(new URL('http://localhost/preview/assets/raw.bin'))).headers.get('content-type'),
    ).toBe('application/octet-stream');
    expect((await local(new Request('http://localhost/preview/assets/missing.json'))).status).toBe(
      404,
    );
    for (const miss of [
      'http://localhost/elsewhere/a.json',
      'http://localhost/preview/assets//a.json',
      'http://localhost/preview/%E0%A4%A',
      'http://localhost/preview/assets%5C..%5C..%5Csecret',
      '/preview/',
    ]) {
      expect((await local(miss)).status).toBe(404);
    }
    expect(await (await local('https://example.com/data.json')).text()).toBe('remote');
    expect(fallback).toHaveBeenCalledTimes(1);
  });

  it('serves fetches from the output while rendering and restores fetch afterwards', async () => {
    const { browserDir } = await built();
    await writeFile(path.join(browserDir, 'data.json'), '{"ok":true}');
    const fake = server({ config: [] });
    const render = fake.module.renderApplication.getMockImplementation()!;
    const fetched: unknown[] = [];
    fake.module.renderApplication.mockImplementation(async (bootstrap, request) => {
      fetched.push(await (await fetch('http://localhost/preview/data.json')).json());
      return render(bootstrap, request);
    });
    const original = globalThis.fetch;
    await runPrerender(
      { browserDir, serverEntry: 'server.mjs', routes: ['/a'], discoverRoutes: false },
      { importModule: fake.importModule },
    );
    expect(fetched).toEqual([{ ok: true }]);
    expect(globalThis.fetch).toBe(original);
    await expect(
      runPrerender(
        { browserDir, serverEntry: 'server.mjs', routes: [], discoverRoutes: false },
        {
          importModule: async () => {
            throw new Error('import failed');
          },
        },
      ),
    ).rejects.toThrow('import failed');
    expect(globalThis.fetch).toBe(original);
  });

  it('reports what the application logs with console.error, per route', async () => {
    const { browserDir } = await built();
    const fake = server({ config: [{ path: 'a', component: class A {} }] });
    const render = fake.module.renderApplication.getMockImplementation()!;
    fake.module.renderApplication.mockImplementation(async (bootstrap, request) => {
      if (request.url.endsWith('/a')) console.error('NG0%s: %o', 100, { detail: 1 });
      return render(bootstrap, request);
    });
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const report = await runPrerender(
        { browserDir, serverEntry: 'server.mjs', routes: [], discoverRoutes: true },
        { importModule: fake.importModule },
      );
      expect(report.errors).toEqual([{ route: '/a', message: 'NG0100: { detail: 1 }' }]);
      // Still printed, and the original console.error is back.
      expect(log).toHaveBeenCalledWith('NG0%s: %o', 100, { detail: 1 });
      expect(console.error).toBe(log);
    } finally {
      log.mockRestore();
    }
  });

  it('fails a route that exceeds the route timeout, naming it', async () => {
    const { browserDir } = await built();
    const fake = server();
    const render = fake.module.renderApplication.getMockImplementation()!;
    fake.module.renderApplication.mockImplementation(async (bootstrap, request) =>
      request.url.endsWith('/slow') ? new Promise<string>(() => {}) : render(bootstrap, request),
    );
    await expect(
      runPrerender(
        {
          browserDir,
          serverEntry: 'server.mjs',
          routes: ['/fast', '/slow'],
          discoverRoutes: false,
          routeTimeoutMs: 20,
        },
        { importModule: fake.importModule },
      ),
    ).rejects.toThrow('[NGDOC_PRERENDER_TIMEOUT] /slow did not render within 20 ms.');
    expect(existsSync(path.join(browserDir, 'fast/index.html'))).toBe(true);
  });

  it('writes process warnings to stderr instead of the error capture, then restores them', () => {
    const listeners: Array<(warning: Error) => void> = [];
    const original = vi.fn();
    listeners.push(original);
    const write = vi.fn();
    const port = {
      pid: 7,
      stderr: { write },
      listeners: () => [...listeners],
      removeAllListeners: () => {
        listeners.length = 0;
      },
      on: (_event: string, listener: (warning: Error) => void) => {
        listeners.push(listener);
      },
    };
    const restore = routeWarningsToStderr(port as never);
    const warning = Object.assign(new Error('punycode is deprecated'), {
      name: 'DeprecationWarning',
    });
    for (const listener of listeners) listener(warning);
    expect(write).toHaveBeenCalledWith('(node:7) DeprecationWarning: punycode is deprecated\n');
    expect(original).not.toHaveBeenCalled();
    restore();
    expect(listeners).toEqual([original]);
  });

  it('renders only the explicit routes without discovery and names every failed route', async () => {
    const { browserDir } = await built('<html></html>');
    const fake = server({ fail: '/b' });
    const request = {
      browserDir,
      serverEntry: 'server.mjs',
      routes: ['/a', '/b'],
      discoverRoutes: false,
    };
    await expect(runPrerender(request, { importModule: fake.importModule })).rejects.toThrow(
      /\[NGDOC_PRERENDER_FAILED\] 1 of 2 route\(s\) failed to render:\n\/b: render broke/,
    );
    expect(fake.module.bootstrap).toHaveBeenCalledTimes(2);
    expect(existsSync(path.join(browserDir, 'a/index.html'))).toBe(true);

    const throwing = server();
    throwing.module.renderApplication.mockRejectedValueOnce('plain');
    await expect(
      runPrerender({ ...request, routes: ['/c'] }, { importModule: throwing.importModule }),
    ).rejects.toThrow(/\/c: plain/);
  });

  it('treats a missing router configuration as no routes and rejects unsafe explicit routes', async () => {
    const { browserDir } = await built();
    const fake = server({ config: undefined });
    const report = await runPrerender(
      { browserDir, serverEntry: 'server.mjs', routes: [], discoverRoutes: true },
      { importModule: fake.importModule },
    );
    expect(report.routes).toEqual([]);
    await expect(
      runPrerender(
        { browserDir, serverEntry: 'server.mjs', routes: ['/a/../b'], discoverRoutes: false },
        { importModule: fake.importModule },
      ),
    ).rejects.toThrow(/NGDOC_PRERENDER_ROUTE/);
  });

  it('rejects a server bundle that is not the application plugin server entry', async () => {
    const { browserDir } = await built();
    await expect(
      runPrerender(
        { browserDir, serverEntry: 'server.mjs', routes: [], discoverRoutes: true },
        { importModule: async () => ({ bootstrap() {} }) },
      ),
    ).rejects.toThrow(
      '[NGDOC_PRERENDER_SERVER_ENTRY] The server bundle does not export Router, renderApplication, runInInjectionContext',
    );
    await expect(
      runPrerender({
        browserDir,
        serverEntry: path.join(browserDir, 'missing.mjs'),
        routes: [],
        discoverRoutes: false,
      }),
    ).rejects.toThrow();
  });

  it('answers one request from its parent, then exits', async () => {
    const sent: Array<{ message: unknown; code?: number }> = [];
    const port = (run: typeof runPrerender) => {
      const listeners = new Map<string, (message?: unknown) => void>();
      const exit = vi.fn();
      runPrerenderChild(
        {
          once: ((event: string, callback: (message?: unknown) => void) => {
            listeners.set(event, callback);
          }) as never,
          send: ((message: unknown, _handle: unknown, _options: unknown, done: () => void) => {
            sent.push({ message });
            done();
            return true;
          }) as never,
          exit: exit as never,
        },
        run,
      );
      return {
        deliver: (message: unknown) => listeners.get('message')!(message),
        disconnect: () => listeners.get('disconnect')!(),
        exit,
      };
    };
    const orphan = port(() => new Promise(() => {}));
    orphan.disconnect();
    expect(orphan.exit).toHaveBeenCalledWith(1);
    const report = { routes: [], excluded: [], shell: 'index.csr.html', errors: [] };
    const ok = port(async () => report);
    ok.deliver({});
    await vi.waitFor(() => expect(ok.exit).toHaveBeenCalledWith(0));
    const failed = port(async () => {
      throw new Error('broken');
    });
    failed.deliver({});
    await vi.waitFor(() => expect(failed.exit).toHaveBeenCalledWith(1));
    const rejected = port(() => Promise.reject('plain'));
    rejected.deliver({});
    await vi.waitFor(() => expect(rejected.exit).toHaveBeenCalledWith(1));
    expect(sent.map(({ message }) => message)).toEqual([
      { type: 'result', report },
      { type: 'error', message: 'broken' },
      { type: 'error', message: 'plain' },
    ]);
  });
});

describe('prerenderNgDoc', () => {
  const entryUrl = new URL('./prerender-child-double.mjs', import.meta.url);
  const options = (browserDir: string) => ({ browserDir, serverEntry: 'server.mjs', entryUrl });

  it('returns the child process report', async () => {
    await expect(
      prerenderNgDoc({ ...options('result'), routes: ['/x'], discoverRoutes: false }),
    ).resolves.toMatchObject({
      routes: [{ path: '/', file: 'index.html' }],
      request: { browserDir: 'result', routes: ['/x'], discoverRoutes: false },
    });
    await expect(prerenderNgDoc(options('result'))).resolves.toMatchObject({
      request: { routes: [], discoverRoutes: true },
    });
  });

  it('rejects with the child error, a silent exit or an abort', async () => {
    await expect(prerenderNgDoc(options('error'))).rejects.toThrow(/NGDOC_PRERENDER_FAILED/);
    await expect(prerenderNgDoc(options('silent'))).rejects.toThrow(
      '[NGDOC_PRERENDER_EXIT] The prerender process exited without a result (code=3, signal=null).',
    );
    const controller = new AbortController();
    const waiting = prerenderNgDoc({ ...options('wait'), signal: controller.signal });
    controller.abort();
    await expect(waiting).rejects.toThrow(/NGDOC_PRERENDER_ABORTED/);
    await expect(
      prerenderNgDoc({ ...options('result'), signal: controller.signal }),
    ).rejects.toThrow(/NGDOC_PRERENDER_ABORTED/);
  });

  it('passes the route timeout, validates it and keeps only heap limits for the child', async () => {
    await expect(
      prerenderNgDoc({ ...options('result'), routeTimeoutMs: 500 }),
    ).resolves.toMatchObject({ request: { routeTimeoutMs: 500 } });
    for (const routeTimeoutMs of [0, 1.5]) {
      await expect(prerenderNgDoc({ ...options('result'), routeTimeoutMs })).rejects.toThrow(
        '[NGDOC_PRERENDER_OPTION] routeTimeoutMs must be a positive integer.',
      );
    }
    expect(
      heapArguments([
        '--inspect',
        '--max-old-space-size=8192',
        '--stack-size=2000',
        '--no-warnings',
      ]),
    ).toEqual(['--max-old-space-size=8192', '--stack-size=2000']);
  });

  it('rejects when the child cannot start', async () => {
    await expect(
      prerenderNgDoc({ ...options('result'), entryUrl: new URL('file:///nonexistent/entry.mjs') }),
    ).rejects.toThrow(/NGDOC_PRERENDER_EXIT/);
  });
});
