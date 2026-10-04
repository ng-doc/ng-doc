import type { ViteDevServer } from 'vite';

/** How long Vite's own close may still run once NgDoc has released what it owns. */
export const HOST_CLOSE_BOUND_MS = 5_000;

export interface BoundedCloseOptions {
  /**
   * Starts NgDoc's complete disposal (idempotent). Part of it waits on work that Vite owns, such
   * as an in-flight component probe transform, so it is bounded together with Vite's close.
   */
  dispose(): Promise<void>;
  /**
   * Settles once NgDoc's own processes, watchers and output lease are released. Called after
   * `dispose()` has started. It is never bounded: resolving close before it would leave children.
   */
  released(): Promise<unknown>;
  warn(message: string): void;
  error(message: string): void;
  boundMs?: number;
}

type Outcome = 'settled' | 'timeout';

/**
 * Makes `server.close()` release NgDoc first and settle even when Vite's own close never does.
 *
 * Vite 7's dependency optimizer never settled the processing promise of a dependency whose first
 * optimization close cancelled, so a pending request for it kept `DevEnvironment.close()` waiting
 * forever. Vite 8 settles those promises on close; the bound stays as a safety net for any other
 * request or plugin hook that never settles, and costs nothing when close does.
 *
 * The replacement always waits for NgDoc to release its own resources. It then gives Vite's close
 * and the rest of NgDoc's disposal `boundMs`. On timeout it reports one diagnostic and resolves;
 * a later failure of either is still logged. Failures within the bound are rethrown.
 * @param server - The development server whose `close` is replaced.
 * @param options - NgDoc's disposal, release signal, loggers and optional bound.
 */
export function boundServerClose(
  server: Pick<ViteDevServer, 'close'>,
  options: BoundedCloseOptions,
): void {
  const hostClose = server.close.bind(server);
  let closing: Promise<void> | undefined;
  server.close = () => (closing ??= closeWithinBound(hostClose, options));
}

async function closeWithinBound(
  hostClose: () => Promise<void>,
  options: BoundedCloseOptions,
): Promise<void> {
  const boundMs = options.boundMs ?? HOST_CLOSE_BOUND_MS;
  const pending = new Set<'vite' | 'ngdoc'>(['vite', 'ngdoc']);
  const host = invoke(hostClose).finally(() => pending.delete('vite'));
  const disposal = invoke(options.dispose).finally(() => pending.delete('ngdoc'));
  await invoke(options.released).catch(() => {
    // The same failure rejects `disposal`, which is reported below.
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const outcome = await Promise.race<Outcome>([
    Promise.allSettled([host, disposal]).then(() => 'settled'),
    new Promise<Outcome>((resolve) => {
      timer = setTimeout(() => resolve('timeout'), boundMs);
    }),
  ]);
  clearTimeout(timer);
  if (outcome === 'settled') {
    await disposal;
    await host;
    return;
  }
  options.warn(
    `[NGDOC_VITE_CLOSE_TIMEOUT] ${[...pending].map(describe).join(' and ')} did not settle ` +
      `within ${boundMs} ms after NgDoc released its processes, watchers and output lease; ` +
      'the server is closed without waiting further. A request or plugin hook that never ' +
      'settles keeps Vite from closing.',
  );
  const late = (label: string) => (cause: unknown) =>
    options.error(`[NGDOC_VITE_CLOSE] ${label} failed after the close bound: ${message(cause)}`);
  // A late failure can only be logged; a settled one is still a failure of this close.
  const ngdocPending = pending.has('ngdoc');
  const vitePending = pending.has('vite');
  if (ngdocPending) void disposal.catch(late('NgDoc disposal'));
  if (vitePending) void host.catch(late("Vite's server.close()"));
  if (!ngdocPending) await disposal;
  if (!vitePending) await host;
}

function invoke<T>(action: () => Promise<T>): Promise<T> {
  try {
    return Promise.resolve(action());
  } catch (cause) {
    return Promise.reject(cause);
  }
}

function describe(part: 'vite' | 'ngdoc'): string {
  return part === 'vite' ? "Vite's server.close()" : "NgDoc's disposal";
}

function message(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
