import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { format } from 'node:util';

import { contentType } from './mime';
import {
  type NgDocExcludedRoute,
  type NgDocPrerenderRoute,
  enumerateRoutes,
} from './route-inventory';

/** The prerender work of one child process. Only JSON values: it crosses the IPC channel. */
export interface PrerenderRequest {
  /** The browser output: its `index.html` is the document every route is rendered into. */
  browserDir: string;
  /** The server bundle built from the application plugin's server entry. */
  serverEntry: string;
  /** Routes rendered in addition to the discovered ones. */
  routes: string[];
  /** Enumerate the application's `Router.config` (default in the callers: true). */
  discoverRoutes: boolean;
  /** Fails a route that takes longer to render, in milliseconds. */
  routeTimeoutMs?: number;
}

export interface PrerenderReport {
  /** Every rendered route, in code-unit order, with the file written for it. */
  routes: Array<NgDocPrerenderRoute & { file: string }>;
  /** Route candidates without a concrete URL (parameters, wildcards, ...), which were skipped. */
  excluded: NgDocExcludedRoute[];
  /** The client-rendered shell, kept next to the prerendered `index.html` of `/`. */
  shell: string;
  /** What the application logged with `console.error` while rendering a route. */
  errors: Array<{ route: string; message: string }>;
}

/** What the server entry of `createNgDocApplicationPlugin` exports. */
interface ServerEntry {
  bootstrap: (context: unknown) => Promise<ApplicationRefLike>;
  renderApplication: (
    bootstrap: (context: unknown) => Promise<ApplicationRefLike>,
    options: { document: string; url: string; allowedHosts?: string[] },
  ) => Promise<string>;
  Router: unknown;
  runInInjectionContext: (injector: unknown, fn: () => unknown) => unknown;
}

interface ApplicationRefLike {
  injector: { get(token: unknown): unknown };
}

export interface PrerenderRuntimeOptions {
  /** Imports the server bundle; tests replace it. */
  importModule?: (url: string) => Promise<unknown>;
}

const SHELL = 'index.csr.html';
const HOST = 'localhost';

function prerenderError(code: string, message: string): Error {
  return new Error(`[${code}] ${message}`);
}

function serverEntry(value: unknown): ServerEntry {
  const module = value as Partial<ServerEntry> | undefined;
  const missing = (['bootstrap', 'renderApplication', 'Router', 'runInInjectionContext'] as const)
    .filter((name) => typeof module?.[name] !== 'function')
    .sort();
  if (missing.length) {
    throw prerenderError(
      'NGDOC_PRERENDER_SERVER_ENTRY',
      `The server bundle does not export ${missing.join(', ')}; build it from the server entry of createNgDocApplicationPlugin.`,
    );
  }
  return module as ServerEntry;
}

/**
 * The `<base href>` of the document, which every request URL starts with.
 */
export function documentBase(document: string): string {
  const href = /<base\s[^>]*href\s*=\s*["']([^"']*)["']/i.exec(document)?.[1];
  if (!href?.startsWith('/')) return '/';
  return href.endsWith('/') ? href : `${href}/`;
}

/**
 * Validates a route path and returns the file it is prerendered into, relative to the browser output.
 */
export function routeFile(route: string): string {
  if (
    !route.startsWith('/') ||
    /[?#\\\0]/.test(route) ||
    route.split('/').some((segment) => segment === '.' || segment === '..')
  ) {
    throw prerenderError('NGDOC_PRERENDER_ROUTE', `Unsupported route path: ${route}`);
  }
  const segments = route.split('/').filter(Boolean);
  return [...segments, 'index.html'].join('/');
}

/**
 * A `fetch` that answers requests for the prerender host from the browser output, as the Angular
 * CLI prerender does: the application loads its own assets (search index, keywords, icons) over
 * HTTP while it renders, and no server listens during a build. Other origins go to `fallback`.
 */
export function localFetch(browserDir: string, base: string, fallback: typeof fetch): typeof fetch {
  return async (input, init) => {
    const target = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      `http://${HOST}`,
    );
    if (target.origin !== `http://${HOST}`) return fallback(input, init);
    let relative: string | undefined;
    try {
      const pathname = decodeURIComponent(target.pathname);
      relative = pathname.startsWith(base) ? pathname.slice(base.length) : undefined;
    } catch {
      relative = undefined;
    }
    const file =
      relative &&
      !relative.includes('\\') &&
      !relative.includes('\0') &&
      !relative.split('/').some((segment) => segment === '..' || segment === '')
        ? await readFile(path.join(browserDir, relative)).catch(() => undefined)
        : undefined;
    if (!file) return new Response('Not found', { status: 404, statusText: 'Not Found' });
    return new Response(new Uint8Array(file), {
      status: 200,
      headers: { 'content-type': contentType(relative!) },
    });
  };
}

/**
 * Sends Node's process warnings (deprecations and the like) straight to stderr until the returned
 * function restores the previous listeners. Node prints them through `console.error`, which the
 * prerender captures as the application's errors.
 */
export function routeWarningsToStderr(
  port: Pick<
    NodeJS.Process,
    'listeners' | 'removeAllListeners' | 'on' | 'pid' | 'stderr'
  > = process,
): () => void {
  const previous = port.listeners('warning');
  port.removeAllListeners('warning');
  const write = (warning: Error) => {
    port.stderr.write(`(node:${port.pid}) ${warning.name}: ${warning.message}\n`);
  };
  port.on('warning', write);
  return () => {
    port.removeAllListeners('warning');
    for (const listener of previous) port.on('warning', listener as (warning: Error) => void);
  };
}

function withTimeout<T>(
  work: Promise<T>,
  milliseconds: number | undefined,
  route: string,
): Promise<T> {
  if (milliseconds === undefined) return work;
  let timer: NodeJS.Timeout | undefined;
  return Promise.race([
    work,
    new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () =>
          reject(
            prerenderError(
              'NGDOC_PRERENDER_TIMEOUT',
              `${route} did not render within ${milliseconds} ms.`,
            ),
          ),
        milliseconds,
      );
    }),
  ]).finally(() => clearTimeout(timer));
}

/**
 * Renders every route of the application into `<browserDir>/<route>/index.html`.
 *
 * The routes are the application's own `Router.config` (lazy children included), plus the
 * explicit ones. The client shell `index.html` is kept as `index.csr.html` before `/` replaces
 * it; a later run over the same output renders into that shell again. All routes are rendered
 * before a failure is reported, and every failed route is named.
 */
export async function runPrerender(
  request: PrerenderRequest,
  options: PrerenderRuntimeOptions = {},
): Promise<PrerenderReport> {
  const importModule = options.importModule ?? ((url: string) => import(url));
  const browserDir = path.resolve(request.browserDir);
  const shellFile = path.join(browserDir, SHELL);
  const document = await readFile(
    existsSync(shellFile) ? shellFile : path.join(browserDir, 'index.html'),
    'utf8',
  );
  const base = documentBase(document);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = localFetch(browserDir, base, originalFetch);
  let entry: ServerEntry;
  try {
    entry = serverEntry(await importModule(pathToFileURL(path.resolve(request.serverEntry)).href));
  } catch (error) {
    globalThis.fetch = originalFetch;
    throw error;
  }
  const url = (route: string) =>
    new URL(`${base}${route.replace(/^\//, '')}`, `http://${HOST}`).href;
  const render = (route: string, bootstrap = entry.bootstrap) =>
    withTimeout(
      entry.renderApplication(bootstrap, { document, url: url(route), allowedHosts: [HOST] }),
      request.routeTimeoutMs,
      route,
    );

  // Angular reports rendering problems (NG0xxx, failed resources) through console.error without
  // failing the render; keep them in the report, attributed to the route being rendered.
  const errors: PrerenderReport['errors'] = [];
  let current = '/';
  const log = console.error;
  const restoreWarnings = routeWarningsToStderr();
  console.error = (...args: unknown[]) => {
    errors.push({ route: current, message: format(...args) });
    log.apply(console, args);
  };
  try {
    return { ...(await renderRoutes()), errors };
  } finally {
    console.error = log;
    restoreWarnings();
    globalThis.fetch = originalFetch;
  }

  async function renderRoutes(): Promise<Omit<PrerenderReport, 'errors'>> {
    const discovered: NgDocPrerenderRoute[] = [];
    const excluded: NgDocExcludedRoute[] = [];
    if (request.discoverRoutes) {
      let inventory: Awaited<ReturnType<typeof enumerateRoutes>> | undefined;
      await render('/', async (context) => {
        const application = await entry.bootstrap(context);
        const router = application.injector.get(entry.Router) as { config?: unknown } | undefined;
        inventory = await enumerateRoutes(Array.isArray(router?.config) ? router.config : [], {
          invoke: (factory) => entry.runInInjectionContext(application.injector, factory),
        });
        return application;
      });
      discovered.push(...inventory!.routes);
      excluded.push(...inventory!.excluded);
    }

    const byPath = new Map<string, NgDocPrerenderRoute>();
    for (const route of discovered) if (!byPath.has(route.path)) byPath.set(route.path, route);
    for (const route of request.routes) {
      const normalized = `/${route.split('/').filter(Boolean).join('/')}`;
      if (!byPath.has(normalized)) byPath.set(normalized, { path: normalized });
    }
    const routes = [...byPath.values()].sort((left, right) =>
      left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
    );
    for (const route of routes) routeFile(route.path);

    await writeFile(shellFile, document);
    const rendered: PrerenderReport['routes'] = [];
    const failures: string[] = [];
    for (const route of routes) {
      const file = routeFile(route.path);
      current = route.path;
      try {
        const html = await render(route.path);
        await mkdir(path.dirname(path.join(browserDir, file)), { recursive: true });
        await writeFile(path.join(browserDir, file), html);
        rendered.push({ ...route, file });
      } catch (error) {
        failures.push(`${route.path}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (failures.length) {
      throw prerenderError(
        'NGDOC_PRERENDER_FAILED',
        `${failures.length} of ${routes.length} route(s) failed to render:\n${failures.slice(0, 10).join('\n')}`,
      );
    }
    return { routes: rendered, excluded, shell: SHELL };
  }
}

/**
 * Child-process side: one request in, one report (or error) out, then exit.
 */
export function runPrerenderChild(
  port: Pick<NodeJS.Process, 'once' | 'send' | 'exit'>,
  run: typeof runPrerender = runPrerender,
): void {
  // The parent is gone (it was stopped or crashed): nobody waits for the result.
  port.once('disconnect', () => port.exit(1));
  port.once('message', (message: unknown) => {
    const finish = (reply: unknown, code: number) => {
      // Angular and zone.js may keep timers alive; the reply is the child's last act.
      port.send!(reply, undefined, undefined, () => port.exit(code));
    };
    void run(message as PrerenderRequest).then(
      (report) => finish({ type: 'result', report }, 0),
      (error: unknown) =>
        finish(
          { type: 'error', message: error instanceof Error ? error.message : String(error) },
          1,
        ),
    );
  });
}
