import { inject, InjectionToken } from '@angular/core';
import type { ActivatedRouteSnapshot, ResolveFn, Route } from '@angular/router';
import type { NgDocContentModule, NgDocContentSource } from '@ng-doc/core/interfaces';

/** The key of the resolver that `ɵwithNgDocContent` adds to a generated page route. */
const RESOLVE_KEY = 'ɵngDocContent';

interface PreloadEntry {
  readonly promise: Promise<NgDocContentModule>;
  payload?: NgDocContentModule;
}

/** The loads started for each content source, so a source loads once however often it is asked. */
const preloads = new WeakMap<NgDocContentSource, PreloadEntry>();

/**
 * The content source of each resolver made by `ɵwithNgDocContent`. The router copies route
 * objects when it loads them, but it keeps their `resolve` maps and functions, so the source is
 * found through the resolver.
 */
const routeSources = new WeakMap<ResolveFn<unknown>, NgDocContentSource>();

/** The wait of each navigation, by its root snapshot. */
const navigationWaits = new WeakMap<ActivatedRouteSnapshot, Promise<void>>();

/**
 * How long the router waits for the content of a page before it shows the page anyway, in
 * milliseconds. A stalled load must not freeze navigation: after this, the page opens and its
 * content renders when it arrives, as without the wait.
 * @internal
 */
export const ɵNG_DOC_CONTENT_WAIT = new InjectionToken<number>('ɵNG_DOC_CONTENT_WAIT', {
  factory: () => 8000,
});

/**
 * Loads a content source once and keeps its payload, so a page that renders it later shows it in
 * its first render. A failed load is forgotten, so the next request tries again.
 * @param source - The content source.
 * @returns The loaded payload.
 * @internal
 */
export function ɵpreloadNgDocContent(source: NgDocContentSource): Promise<NgDocContentModule> {
  const existing = preloads.get(source);

  if (existing) return existing.promise;

  // Preloads are shared between navigations, so no navigation may abort them.
  const promise = Promise.resolve()
    .then(() => source.load(new AbortController().signal))
    .then(
      (payload: NgDocContentModule) => {
        if (preloads.get(source) === entry) entry.payload = payload;
        return payload;
      },
      (error: unknown) => {
        if (preloads.get(source) === entry) preloads.delete(source);
        throw error;
      },
    );
  const entry: PreloadEntry = { promise };

  preloads.set(source, entry);

  return promise;
}

/**
 * Returns the payload of a source that `ɵpreloadNgDocContent` has loaded, without waiting.
 * @param source - The content source.
 * @returns The payload, or `undefined` when the source has not finished loading.
 * @internal
 */
export function ɵpeekNgDocContent(source: NgDocContentSource): NgDocContentModule | undefined {
  return preloads.get(source)?.payload;
}

/**
 * Returns the load of a source that `ɵpreloadNgDocContent` started and that has not finished,
 * so a page that opens before it finishes waits for the same load instead of starting another.
 * @param source - The content source.
 * @returns The pending load, or `undefined`.
 * @internal
 */
export function ɵpendingNgDocContent(
  source: NgDocContentSource,
): Promise<NgDocContentModule> | undefined {
  const entry = preloads.get(source);

  return entry && !entry.payload ? entry.promise : undefined;
}

/**
 * Drops the preloaded payload of a source, for a source that reports a new revision.
 * @param source - The content source.
 * @internal
 */
export function ɵforgetNgDocContent(source: NgDocContentSource): void {
  preloads.delete(source);
}

/**
 * Makes the router wait for the content of a generated page before it shows the page. Without
 * it, the router removes the previous page as soon as the page's code has loaded, and an empty
 * page shows until its content arrives.
 *
 * The resolver loads the content of every route of the navigation that has some, all at once,
 * because the router runs the resolvers of nested routes one after another. A load that fails
 * still lets the navigation finish: the page shows the error. A load that takes longer than
 * `ɵNG_DOC_CONTENT_WAIT` lets it finish too: the page then renders its content when it arrives.
 * @param route - The route of the page.
 * @param source - The content source of the route's component.
 * @returns A copy of the route with the resolver added.
 * @internal
 */
export function ɵwithNgDocContent(route: Route, source: NgDocContentSource): Route {
  const resolver: ResolveFn<boolean> = async (snapshot: ActivatedRouteSnapshot) => {
    // The resolvers of one navigation share its root snapshot, and with it one wait: nested
    // resolvers run one after another, and each must not start a wait of its own.
    let wait = navigationWaits.get(snapshot.root);

    if (!wait) {
      const sources = new Set<NgDocContentSource>();
      const add = (item: ActivatedRouteSnapshot): void => {
        ɵngDocRouteContentSources(item.routeConfig).forEach((found) => sources.add(found));
      };

      snapshot.pathFromRoot.forEach(add);
      for (let child = snapshot.firstChild; child; child = child.firstChild) add(child);
      wait = waitFor([...sources], inject(ɵNG_DOC_CONTENT_WAIT));
      navigationWaits.set(snapshot.root, wait);
    }
    await wait;

    return true;
  };

  routeSources.set(resolver, source);

  return { ...route, resolve: { ...route.resolve, [RESOLVE_KEY]: resolver } };
}

/**
 * Waits until the sources have loaded or failed, or for at most `limit` milliseconds.
 * @param sources - The content sources.
 * @param limit - The longest wait, in milliseconds.
 * @returns A promise that settles when the wait is over; it never rejects.
 */
async function waitFor(sources: NgDocContentSource[], limit: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    await Promise.race([
      Promise.all(sources.map((item) => ɵpreloadNgDocContent(item).catch(() => undefined))),
      // The timer is cleared as soon as the content is in, so it never keeps a server render or
      // a zone application from becoming stable.
      new Promise<void>((resolve) => (timer = setTimeout(resolve, limit))),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Returns the content sources that `ɵwithNgDocContent` attached to a route.
 * @param route - The route, as declared or as the router copied it.
 * @returns The content sources of the route.
 * @internal
 */
export function ɵngDocRouteContentSources(route: Route | null | undefined): NgDocContentSource[] {
  return Object.values(route?.resolve ?? {})
    .map((resolver: unknown) => routeSources.get(resolver as ResolveFn<unknown>))
    .filter((source): source is NgDocContentSource => source !== undefined);
}
