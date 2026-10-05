import { isPlatformBrowser, LocationStrategy } from '@angular/common';
import {
  DestroyRef,
  DOCUMENT,
  inject,
  Injector,
  NgZone,
  PLATFORM_ID,
  Service,
} from '@angular/core';
import { PRIMARY_OUTLET, Route, Router, RouterPreloader, UrlTree } from '@angular/router';
import {
  ɵngDocRouteContentSources,
  ɵngDocRouteUrl,
  ɵpreloadNgDocContent,
} from '@ng-doc/app/helpers';
import { NG_DOC_ROUTE_PREFIX } from '@ng-doc/app/tokens';

/** The events that tell that the reader is about to open a link. */
const INTENT_EVENTS = ['pointerover', 'mouseover', 'focusin', 'touchstart'] as const;

/** How long the browser may stay busy before an idle preload runs anyway, in milliseconds. */
const IDLE_TIMEOUT = 2000;
/** The delay of an idle preload where the browser has no `requestIdleCallback`. */
const IDLE_FALLBACK_DELAY = 200;

/** The parts of the Network Information API that preloading reads. */
interface NgDocNetworkInformation {
  readonly saveData?: boolean;
  readonly effectiveType?: string;
}

/**
 * Preloads the pages that the reader is about to open, so that opening them shows them at once.
 *
 * It preloads a page when the reader points at, focuses or touches a link to it, anywhere in the
 * document: the sidebar, the previous and next page links, links in the page content, search
 * results and the table of contents. It also preloads the previous and next pages of a guide once
 * the browser is idle after the guide has rendered. A preload loads the code of the page's route
 * and its content, once per page. Nothing is preloaded on the server, when the reader asked the
 * browser to save data, or on a 2G connection.
 *
 * The router loads the code through its preloading strategy, so preloading works only when the
 * application sets `NgDocPreloadingStrategy` as that strategy:
 *
 * ```ts
 * provideRouter(routes, withPreloading(NgDocPreloadingStrategy));
 * ```
 */
@Service()
export class NgDocRoutePreloader {
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  private readonly ngZone = inject(NgZone);
  private readonly router = inject(Router);
  private readonly locationStrategy = inject(LocationStrategy);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  /** The path segments under which the documentation's routes live (`routePrefix`). */
  private readonly prefix = (inject(NG_DOC_ROUTE_PREFIX, { optional: true }) ?? '')
    .split('/')
    .filter(Boolean);
  /** The pages that were asked for, by path, so each page is preloaded once. */
  private readonly requested = new Set<string>();
  /** The paths, as URL segments, whose routes are being loaded. */
  private readonly loading = new Map<string, readonly string[]>();
  private enabled = false;
  private destroyed = false;
  private lastAnchor?: Element;
  private cancelIdle?: () => void;

  private readonly intent = (event: Event): void => {
    const target = event.target;
    const anchor =
      typeof Element !== 'undefined' && target instanceof Element
        ? target.closest('a[href]')
        : null;

    // Pointer events fire for every element under the pointer, so a link is checked only when
    // the pointer reaches it.
    if (!anchor || (anchor === this.lastAnchor && event.type !== 'focusin')) return;
    this.lastAnchor = anchor;

    const url = this.linkUrl(anchor);

    if (url !== undefined) this.preload(url);
  };

  constructor() {
    inject(DestroyRef).onDestroy(() => this.destroy());
  }

  /**
   * Turns preloading on and starts listening for links the reader is about to open. Called by
   * `NgDocPreloadingStrategy` when the router creates it; does nothing on the server.
   * @internal
   */
  enable(): void {
    if (this.enabled || this.destroyed || !this.browser) return;
    this.enabled = true;

    const view = this.document.defaultView;

    if (!view) return;
    // A link the reader points at must not run change detection in a zone application.
    this.ngZone.runOutsideAngular(() => {
      INTENT_EVENTS.forEach((type: string) =>
        this.document.addEventListener(type, this.intent, { capture: true, passive: true }),
      );
    });
  }

  /**
   * Preloads the code and the content of the page at a URL of the application. A page is
   * preloaded once; the current page is not preloaded.
   * @param url - The URL, relative to the application's base, for example `/docs/get-started`.
   * @returns Whether a preload started.
   */
  preload(url: string | UrlTree): boolean {
    if (!this.active()) return false;

    let segments: string[];

    try {
      segments = urlSegments(typeof url === 'string' ? this.router.parseUrl(url) : url);
    } catch {
      return false;
    }

    // Only the documentation's own pages are preloaded, never the rest of the application.
    if (this.prefix.some((part, index) => segments[index] !== part)) return false;

    const key = segments.join('/');

    if (this.requested.has(key) || key === urlSegments(this.currentUrl()).join('/')) return false;
    this.requested.add(key);
    this.loading.set(key, segments);

    this.ngZone.runOutsideAngular(() => {
      this.injector
        .get(RouterPreloader)
        .preload()
        .subscribe({ complete: () => this.loaded(key, segments) });
    });

    return true;
  }

  /**
   * Preloads pages once the browser is idle. A later call replaces the pages of an earlier one
   * that has not run yet.
   * @param urls - The URLs of the pages; missing ones are skipped.
   */
  preloadWhenIdle(urls: ReadonlyArray<string | undefined>): void {
    this.cancelIdle?.();
    this.cancelIdle = undefined;

    const view = this.document.defaultView;
    const pages = urls.filter((url): url is string => !!url);

    if (!this.active() || !view || !pages.length) return;

    const run = (): void => {
      this.cancelIdle = undefined;
      pages.forEach((url: string) => this.preload(url));
    };

    this.ngZone.runOutsideAngular(() => {
      if (typeof view.requestIdleCallback === 'function') {
        const handle = view.requestIdleCallback(run, { timeout: IDLE_TIMEOUT });

        this.cancelIdle = () => view.cancelIdleCallback(handle);
      } else {
        const handle = view.setTimeout(run, IDLE_FALLBACK_DELAY);

        this.cancelIdle = () => view.clearTimeout(handle);
      }
    });
  }

  /**
   * Whether the router should load a lazy route now: the route leads to a page that is being
   * preloaded.
   * @param route - A lazy route that the router has not loaded yet.
   * @returns Whether to load it.
   * @internal
   */
  shouldPreload(route: Route): boolean {
    if (!this.enabled || this.destroyed) return false;
    for (const segments of this.loading.values()) {
      if (routesOnPath(this.router.config, segments).has(route)) return true;
    }
    return false;
  }

  private loaded(key: string, segments: readonly string[]): void {
    this.loading.delete(key);
    if (this.destroyed) return;

    const routes = routesOnPath(this.router.config, segments);

    // The strategy turns a failed load into no load, so the router's own preloading survives
    // it. A route that is still not loaded failed: a later intent may try again.
    if ([...routes].some((route) => route.loadChildren && !loadedRoutes(route))) {
      this.requested.delete(key);
      return;
    }
    // The routes of the page have loaded, so the content sources of their components are known.
    for (const route of routes) {
      for (const source of ɵngDocRouteContentSources(route)) {
        ɵpreloadNgDocContent(source).catch(() => undefined);
      }
    }
  }

  private active(): boolean {
    return this.enabled && !this.destroyed && !constrainedConnection(this.document);
  }

  private currentUrl(): UrlTree {
    return this.router.parseUrl(this.router.url);
  }

  /**
   * Returns the application URL of a link, or `undefined` for a link that leaves the
   * application, opens elsewhere, downloads a file or points into the current page.
   *
   * The link is read through the location strategy: with `PathLocationStrategy` the route is the
   * link's path, and with `HashLocationStrategy` (`withHashLocation()`) it is the link's fragment
   * (`#/docs/page`), so a fragment that is not a route (`#usage`) is an anchor on the page.
   * @param anchor - The link.
   * @returns The URL relative to the application's base, with its query.
   */
  private linkUrl(anchor: Element): string | undefined {
    const view = this.document.defaultView;
    const href = anchor.getAttribute('href');
    const target = anchor.getAttribute('target');

    if (!view || !href || anchor.hasAttribute('download') || (target && target !== '_self')) {
      return undefined;
    }

    let url: URL;

    try {
      url = new URL(href, this.document.baseURI);
    } catch {
      return undefined;
    }

    if (url.origin !== view.location.origin) return undefined;

    if (this.hashLocation()) {
      // The route lives in the fragment of this document; another document leaves the
      // application.
      if (url.pathname !== view.location.pathname || !url.hash.startsWith('#/')) return undefined;

      url = new URL(url.hash.slice(1).replace(/^\/*/, '/'), view.location.origin);
    } else if (href.startsWith('#')) {
      return undefined;
    }

    // The current page: an anchor on it, or a link to itself.
    if (url.pathname === ɵngDocRouteUrl(this.locationStrategy, view.location.href).pathname) {
      return undefined;
    }

    const base = this.basePath();

    if (!`${url.pathname}/`.startsWith(base)) return undefined;

    return `/${url.pathname.slice(base.length)}${url.search}`;
  }

  /**
   * Whether the location strategy keeps the route in the document's fragment, as
   * `HashLocationStrategy` does.
   */
  private hashLocation(): boolean {
    return this.locationStrategy.prepareExternalUrl('/').startsWith('#');
  }

  /**
   * The base path of the application's routes, ending with a slash: the base href, which a
   * fragment route carries only when `APP_BASE_HREF` sets one.
   */
  private basePath(): string {
    const base = this.locationStrategy.getBaseHref() || '/';
    const path = this.hashLocation()
      ? base.replace(/^\/*/, '/')
      : new URL(base, this.document.baseURI).pathname;

    return path.endsWith('/') ? path : `${path}/`;
  }

  private destroy(): void {
    this.destroyed = true;
    this.cancelIdle?.();
    this.cancelIdle = undefined;
    this.loading.clear();
    INTENT_EVENTS.forEach((type: string) =>
      this.document.removeEventListener(type, this.intent, { capture: true }),
    );
  }
}

/**
 * Whether the reader asked the browser to save data or the connection is 2G, where preloading
 * would compete with what the reader opens.
 * @param document - The document of the application.
 * @returns Whether to skip preloading.
 */
function constrainedConnection(document: Document): boolean {
  const navigator = document.defaultView?.navigator as
    | (Navigator & { connection?: NgDocNetworkInformation })
    | undefined;
  const connection = navigator?.connection;

  return (
    !!connection &&
    (connection.saveData === true || /(^|-)2g$/.test(connection.effectiveType ?? ''))
  );
}

/**
 * Returns the path segments of the primary outlet of a URL.
 * @param url - The URL.
 * @returns The segments.
 */
function urlSegments(url: UrlTree): string[] {
  return url.root.children[PRIMARY_OUTLET]?.segments.map(({ path }) => path) ?? [];
}

/**
 * Returns the routes that can match a path: those whose own path matches its start, through
 * the children the router has loaded so far. A lazy route whose children have not loaded yet
 * may lead anywhere below its path.
 * @param routes - The routes to search.
 * @param segments - The path segments.
 * @param found - Collects the routes.
 * @returns The routes.
 */
function routesOnPath(
  routes: readonly Route[],
  segments: readonly string[],
  found: Set<Route> = new Set(),
): Set<Route> {
  for (const route of routes) {
    if (
      (route.outlet ?? PRIMARY_OUTLET) !== PRIMARY_OUTLET ||
      route.matcher ||
      route.redirectTo !== undefined ||
      // A guarded route may not match for this reader; only opening the page may decide.
      route.canMatch?.length
    ) {
      continue;
    }

    const consumed = matchedSegments(route.path ?? '', segments);

    if (consumed === undefined) continue;

    const rest = segments.slice(consumed);
    const children = route.children ?? loadedRoutes(route);
    // A route without children matches only the whole remaining path.
    const leaf = !route.children && !route.loadChildren;

    if ((route.pathMatch === 'full' || leaf) && rest.length) continue;

    found.add(route);
    if (children) routesOnPath(children, rest, found);
  }

  return found;
}

/**
 * Returns how many segments a route path matches at the start of a path.
 * @param path - The route path.
 * @param segments - The path segments.
 * @returns The number of matched segments, or `undefined` when the route does not match.
 */
function matchedSegments(path: string, segments: readonly string[]): number | undefined {
  if (!path) return 0;

  const parts = path.split('/');

  for (let index = 0; index < parts.length; index++) {
    const part = parts[index];

    if (part === '**') return segments.length;
    if (index >= segments.length) return undefined;
    if (!part.startsWith(':') && part !== segments[index]) return undefined;
  }

  return parts.length;
}

/**
 * Returns the children that the router loaded for a lazy route. The router keeps them on the
 * route itself and has no public API for them; its own preloader reads the same property.
 * Without it, preloading stops at the first lazy route.
 * @param route - The route.
 * @returns The loaded children, if any.
 */
function loadedRoutes(route: Route): readonly Route[] | undefined {
  return (route as Route & { _loadedRoutes?: Route[] })._loadedRoutes;
}
