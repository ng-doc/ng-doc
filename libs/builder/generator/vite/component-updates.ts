import type { Connect, Plugin, ViteDevServer } from 'vite';

/** The custom HMR event Analog sends after it recompiled a component. */
const COMPONENT_UPDATE_EVENT = 'angular:component-update';
/** The path Angular's HMR code loads a component's metadata update from (Analog's endpoint). */
const COMPONENT_UPDATE_PATH = '/@ng/component';
/** Updates kept: a browser fetches an update right after its event, so only recent ones matter. */
const MAX_DISPATCHED_UPDATES = 256;

type Send = (...args: unknown[]) => unknown;

/**
 * Lets Analog's component update endpoint answer only the requests that answer an update event
 * Analog sent; every other request gets an empty module, which applies no update.
 *
 * Angular's HMR code for a component loads `@ng/component?c=<file>@<class>&t=<timestamp>` on each
 * `angular:component-update` event, with the event's timestamp, and once more whenever the module
 * is evaluated, with `Date.now()`. The module Vite serves is always the latest compilation, so the
 * load-time request never has anything to apply. Analog's endpoint answers it with the file's last
 * update as soon as Vite has ever invalidated the module, and it keeps one update per file, that of
 * the file's last component. Vite invalidates every module when the dependency optimizer reloads
 * the page after it found a dependency late (a template-derived import, a demo's dependency). From
 * then on, until the server restarts, each load applied the last component's metadata to every
 * other component of its file, with the wrong namespaces: `Cannot read properties of undefined
 * (reading 'MatButton')`, or another component's template.
 *
 * Analog's SSR path answers the load-time request of every module the same way, without any
 * invalidation; the gate covers it too.
 * @returns A serve-only plugin that must run before Analog's live reload plugin.
 */
export function createComponentUpdateGate(): Plugin {
  const dispatched = new Set<string>();
  const key = (component: string, timestamp: string) => `${component}\n${timestamp}`;

  const observe = (payload: unknown, data: unknown) => {
    const update =
      typeof payload === 'string'
        ? payload === COMPONENT_UPDATE_EVENT
          ? data
          : undefined
        : isRecord(payload) &&
            payload['type'] === 'custom' &&
            payload['event'] === COMPONENT_UPDATE_EVENT
          ? payload['data']
          : undefined;
    if (!isRecord(update) || typeof update['id'] !== 'string') return;
    const timestamp = update['timestamp'];
    if (typeof timestamp !== 'number' && typeof timestamp !== 'string') return;
    let component: string;
    try {
      // The event carries the encoded id; the request's `c` parameter decodes to the plain one.
      component = decodeURIComponent(update['id']);
    } catch {
      return;
    }
    const entry = key(component, String(timestamp));
    dispatched.delete(entry);
    dispatched.add(entry);
    // Insertion order: the oldest update comes first.
    for (const oldest of dispatched) {
      if (dispatched.size <= MAX_DISPATCHED_UPDATES) break;
      dispatched.delete(oldest);
    }
  };

  /**
   * `undefined` when Analog should handle the request itself, else whether it may serve it.
   * @param url - The request URL, or the SSR module id without its `\0` prefix.
   */
  const admitted = (url: string): boolean | undefined => {
    if (!url.includes(COMPONENT_UPDATE_PATH)) return undefined;
    const parameters = new URL(url, 'http://localhost').searchParams;
    const component = parameters.get('c');
    // Analog rejects a request without a component itself.
    if (!component) return undefined;
    return dispatched.has(key(component, parameters.get('t') ?? ''));
  };

  const middleware: Connect.NextHandleFunction = (request, response, next) => {
    if (request.url === undefined || admitted(request.url) !== false) {
      next();
      return;
    }
    // What Analog itself answers for a component it has no update for.
    response.setHeader('Content-Type', 'text/javascript');
    response.setHeader('Cache-Control', 'no-cache');
    response.end('');
  };

  return {
    name: '@ng-doc/vite:component-updates',
    apply: 'serve',
    configureServer: {
      // Before Analog's live reload plugin registers its endpoint and wraps the HMR channels.
      order: 'pre',
      handler(server: ViteDevServer) {
        // Vite 6 can have a separate client channel; newer versions share `server.ws`.
        for (const channel of new Set([server.ws, server.environments?.['client']?.hot])) {
          if (!channel) continue;
          const send = channel.send as Send;
          (channel as { send: Send }).send = (...args: unknown[]) => {
            observe(args[0], args[1]);
            return Reflect.apply(send, channel, args);
          };
        }
        server.middlewares.use(middleware);
      },
    },
    load: {
      order: 'pre',
      handler(id: string, options?: { ssr?: boolean }) {
        if (!options?.ssr) return undefined;
        // Analog resolves the SSR request to `\0file:///…/@ng/component?c=…&t=…`.
        return admitted(id.replace(/^\0/, '')) === false ? '' : undefined;
      },
    },
  };
}

/**
 * Whether a value is a non-null object.
 * @param value - Any value.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
