import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import type { PrerenderReport, PrerenderRequest } from './prerender-runtime';

export type { PrerenderReport as NgDocPrerenderReport } from './prerender-runtime';
export type { NgDocExcludedRoute, NgDocPrerenderRoute } from './route-inventory';

export interface NgDocPrerenderOptions {
  /** The browser output of the client build (it holds `index.html`). */
  browserDir: string;
  /** The server bundle of the server build (`server.mjs`). */
  serverEntry: string;
  /** Routes rendered in addition to the discovered ones, for example parameterized pages. */
  routes?: readonly string[];
  /** Enumerate the application's `Router.config`, lazy children included (default true). */
  discoverRoutes?: boolean;
  /** Fails a route that takes longer to render, in milliseconds (default: no limit). */
  routeTimeoutMs?: number;
  signal?: AbortSignal;
  /** The child process entry; tests replace it. */
  entryUrl?: URL;
}

type ChildReply = { type: 'result'; report: PrerenderReport } | { type: 'error'; message: string };

function prerenderError(code: string, message: string): Error {
  return new Error(`[${code}] ${message}`);
}

/** The V8 heap and stack limits of the host's `execArgv`, which the child keeps. */
export function heapArguments(execArgv: readonly string[]): string[] {
  return execArgv.filter((item) =>
    /^--(?:max-old-space-size|max-semi-space-size|stack-size)=/.test(item),
  );
}

/**
 * Prerenders every route of a built application into its browser output.
 *
 * Rendering runs in a child process: the server bundle carries its own Angular and zone.js,
 * which patch the process's globals, so they never share a process with the Vite builds.
 */
export function prerenderNgDoc(options: NgDocPrerenderOptions): Promise<PrerenderReport> {
  const request: PrerenderRequest = {
    browserDir: options.browserDir,
    serverEntry: options.serverEntry,
    routes: [...(options.routes ?? [])],
    discoverRoutes: options.discoverRoutes ?? true,
    ...(options.routeTimeoutMs === undefined ? {} : { routeTimeoutMs: options.routeTimeoutMs }),
  };
  if (
    request.routeTimeoutMs !== undefined &&
    (!Number.isSafeInteger(request.routeTimeoutMs) || request.routeTimeoutMs < 1)
  ) {
    return Promise.reject(
      prerenderError('NGDOC_PRERENDER_OPTION', 'routeTimeoutMs must be a positive integer.'),
    );
  }
  return new Promise<PrerenderReport>((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(prerenderError('NGDOC_PRERENDER_ABORTED', 'Prerendering was aborted.'));
      return;
    }
    const child = fork(
      fileURLToPath(options.entryUrl ?? new URL('./prerender-entry.js', import.meta.url)),
      [],
      // Keep the host's heap limits (a large site renders many routes in one process), nothing else.
      { execArgv: heapArguments(process.execArgv), stdio: ['ignore', 'inherit', 'inherit', 'ipc'] },
    );
    let reply: ChildReply | undefined;
    const abort = () => child.kill('SIGKILL');
    options.signal?.addEventListener('abort', abort, { once: true });
    child.on('message', (message) => {
      reply ??= message as ChildReply;
    });
    child.once('error', (error) => {
      options.signal?.removeEventListener('abort', abort);
      reject(error);
    });
    child.once('exit', (code, signal) => {
      options.signal?.removeEventListener('abort', abort);
      if (options.signal?.aborted) {
        reject(prerenderError('NGDOC_PRERENDER_ABORTED', 'Prerendering was aborted.'));
      } else if (reply?.type === 'result' && code === 0) {
        resolve(reply.report);
      } else if (reply?.type === 'error') {
        reject(new Error(reply.message));
      } else {
        reject(
          prerenderError(
            'NGDOC_PRERENDER_EXIT',
            `The prerender process exited without a result (code=${String(code)}, signal=${String(signal)}).`,
          ),
        );
      }
    });
    // A failed send means the child is gone; its exit reports that.
    child.send(request, () => {});
  });
}
