import { APP_BASE_HREF, LocationStrategy } from '@angular/common';
import { ChangeDetectionStrategy, Component, PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  provideRouter,
  Route,
  Router,
  RouterFeatures,
  RouterPreloader,
  Routes,
  withHashLocation,
  withPreloading,
} from '@angular/router';
import { ɵwithNgDocContent } from '@ng-doc/app/helpers';
import { NgDocPreloadingStrategy, NgDocRoutePreloader } from '@ng-doc/app/services/route-preloader';
import { NG_DOC_ROUTE_PREFIX } from '@ng-doc/app/tokens';
import type { NgDocContentModule, NgDocContentSource } from '@ng-doc/core/interfaces';
import { lastValueFrom, of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { describeChangeDetection } from '../change-detection/change-detection-modes';

@Component({
  selector: 'ng-doc-preload-page',
  template: 'page',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class PreloadPageComponent {}

/** One lazy page: the code of its route and its content, each counting its loads. */
interface LazyPage {
  readonly route: Route;
  readonly chunkLoads: () => number;
  readonly contentLoads: () => number;
}

/**
 * A lazy page that counts the loads of its code and its content.
 * @param path - The path of the page.
 * @returns The page.
 */
function lazyPage(path: string): LazyPage {
  let chunkLoads = 0;
  let contentLoads = 0;
  const source: NgDocContentSource = {
    id: path,
    load: async (): Promise<NgDocContentModule> => {
      contentLoads++;
      return { schemaVersion: 1, id: path, revision: 'r1', html: `<p>${path}</p>` };
    },
  };

  return {
    route: {
      path,
      loadChildren: async () => {
        chunkLoads++;
        return [ɵwithNgDocContent({ path: '', component: PreloadPageComponent }, source)];
      },
    },
    chunkLoads: () => chunkLoads,
    contentLoads: () => contentLoads,
  };
}

describeChangeDetection('NgDocRoutePreloader', ({ providers }) => {
  let pages: Record<'current' | 'next' | 'other', LazyPage>;
  let docsLoads: number;
  let landingLoads: number;
  let blogLoads: number;
  let guardedLoads: number;
  let flakyLoads: number;
  let anchors: HTMLElement;

  /**
   * Configures a router with a lazy docs route of three lazy pages, and a lazy landing page.
   * @param extra - More providers.
   * @param features - More router features, such as `withHashLocation()`.
   */
  function configure(extra: unknown[] = [], features: RouterFeatures[] = []): void {
    pages = { current: lazyPage('current'), next: lazyPage('next'), other: lazyPage('other') };
    docsLoads = 0;
    landingLoads = 0;
    blogLoads = 0;
    guardedLoads = 0;
    flakyLoads = 0;

    const routes: Routes = [
      {
        path: 'docs',
        loadChildren: async () => {
          docsLoads++;
          return [
            pages.current.route,
            pages.next.route,
            pages.other.route,
            {
              path: 'guarded',
              canMatch: [() => true],
              loadChildren: async () => {
                guardedLoads++;
                return [{ path: '', component: PreloadPageComponent }];
              },
            },
            {
              path: 'flaky',
              loadChildren: async () => {
                // The first load fails, as a chunk request can on a bad connection.
                if (flakyLoads++ === 0) throw new Error('offline');
                return [{ path: '', component: PreloadPageComponent }];
              },
            },
          ];
        },
      },
      {
        path: 'blog',
        loadChildren: async () => {
          blogLoads++;
          return [{ path: '', component: PreloadPageComponent }];
        },
      },
      {
        path: '',
        pathMatch: 'full',
        loadChildren: async () => {
          landingLoads++;
          return [{ path: '', component: PreloadPageComponent }];
        },
      },
    ];

    TestBed.configureTestingModule({
      providers: [
        ...providers,
        provideRouter(routes, withPreloading(NgDocPreloadingStrategy), ...features),
        // The documentation's routes live under `docs`, as `routePrefix` says.
        { provide: NG_DOC_ROUTE_PREFIX, useValue: 'docs' },
        ...(extra as []),
      ],
    });
    // An application creates the router's preloader, and with it the strategy, when it
    // bootstraps; a test host does not bootstrap.
    TestBed.inject(RouterPreloader);
  }

  /**
   * Waits for some macrotasks.
   * @param count - How many.
   */
  async function turns(count: number = 10): Promise<void> {
    for (let turn = 0; turn < count; turn++) await new Promise((done) => setTimeout(done));
  }

  /**
   * Adds a link to the document.
   * @param href - The link's `href`.
   * @param attributes - More attributes.
   * @returns The link.
   */
  function link(href: string, attributes: Record<string, string> = {}): HTMLAnchorElement {
    const anchor = document.createElement('a');

    anchor.setAttribute('href', href);
    Object.entries(attributes).forEach(([name, value]) => anchor.setAttribute(name, value));
    // Links in generated content have markup inside them; the intent targets that markup.
    anchor.innerHTML = '<code>link</code>';
    anchors.appendChild(anchor);

    return anchor;
  }

  /**
   * Dispatches an intent event from inside a link, as a pointer over its text would.
   * @param anchor - The link.
   * @param type - The event type.
   */
  function point(anchor: HTMLElement, type: string = 'pointerover'): void {
    anchor.firstElementChild?.dispatchEvent(new Event(type, { bubbles: true }));
  }

  /**
   * Navigates and waits for the page to settle.
   * @param url - The URL.
   */
  async function open(url: string): Promise<void> {
    await TestBed.inject(Router).navigateByUrl(url);
    await turns();
  }

  beforeEach(() => {
    anchors = document.createElement('div');
    document.body.appendChild(anchors);
  });

  afterEach(() => {
    anchors.remove();
    delete (navigator as { connection?: unknown }).connection;
    TestBed.resetTestingModule();
  });

  it('preloads the code and the content of an internal link once', async () => {
    configure();
    await open('/docs/current');
    expect(pages.next.chunkLoads()).toBe(0);

    const next = link('/docs/next');

    point(next);
    await turns();
    expect(pages.next.chunkLoads()).toBe(1);
    expect(pages.next.contentLoads()).toBe(1);

    // Pointing again, from either event, and focusing or touching the link loads nothing more.
    point(next);
    point(next, 'mouseover');
    point(next, 'focusin');
    point(next, 'touchstart');
    point(link('/docs/next?tab=api'));
    await turns();
    expect(pages.next.chunkLoads()).toBe(1);
    expect(pages.next.contentLoads()).toBe(1);
    // Only the page the reader is about to open loads.
    expect(pages.other.chunkLoads()).toBe(0);
    expect(landingLoads).toBe(0);

    // Opening the preloaded page loads nothing again.
    await open('/docs/next');
    expect(pages.next.chunkLoads()).toBe(1);
    expect(pages.next.contentLoads()).toBe(1);
  });

  it('ignores external links, anchors, the current page and links opened elsewhere', async () => {
    configure();
    await open('/docs/current');
    const before = { current: pages.current.contentLoads(), docs: docsLoads };

    point(link('https://example.com/docs/other'));
    point(link('#usage'));
    point(link('/docs/current#usage'));
    point(link('/docs/current'));
    point(link('/docs/other', { target: '_blank' }));
    point(link('/docs/other', { download: '' }));
    point(link('mailto:someone@example.com'));
    await turns();

    expect(pages.other.chunkLoads()).toBe(0);
    expect(pages.other.contentLoads()).toBe(0);
    expect(pages.current.contentLoads()).toBe(before.current);
    expect(docsLoads).toBe(before.docs);
  });

  it('loads every lazy level that leads to the page, from a cold start', async () => {
    configure();
    await open('/');
    expect(docsLoads).toBe(0);

    expect(TestBed.inject(NgDocRoutePreloader).preload('/docs/other')).toBe(true);
    await turns();

    expect(docsLoads).toBe(1);
    expect(pages.other.chunkLoads()).toBe(1);
    expect(pages.other.contentLoads()).toBe(1);
    expect(pages.current.chunkLoads()).toBe(0);
    expect(pages.next.chunkLoads()).toBe(0);
  });

  it('preloads pages once the browser is idle', async () => {
    configure();
    await open('/docs/current');

    TestBed.inject(NgDocRoutePreloader).preloadWhenIdle(['/docs/next', undefined, '/docs/other']);
    expect(pages.next.chunkLoads()).toBe(0);
    await turns(2);
    // The fallback of `requestIdleCallback` waits a while before it runs.
    await new Promise((done) => setTimeout(done, 250));
    await turns();

    expect(pages.next.chunkLoads()).toBe(1);
    expect(pages.other.chunkLoads()).toBe(1);
  });

  it('preloads nothing when the reader saves data or the connection is 2G', async () => {
    configure();
    await open('/docs/current');
    const preloader = TestBed.inject(NgDocRoutePreloader);

    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      value: { saveData: true, effectiveType: '4g' },
    });
    point(link('/docs/next'));
    expect(preloader.preload('/docs/next')).toBe(false);

    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      value: { saveData: false, effectiveType: 'slow-2g' },
    });
    expect(preloader.preload('/docs/next')).toBe(false);
    await turns();
    expect(pages.next.chunkLoads()).toBe(0);

    // The same page preloads once the connection allows it.
    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      value: { saveData: false, effectiveType: '4g' },
    });
    expect(preloader.preload('/docs/next')).toBe(true);
    await turns();
    expect(pages.next.chunkLoads()).toBe(1);
  });

  it('preloads nothing on the server', async () => {
    configure([{ provide: PLATFORM_ID, useValue: 'server' }]);
    const strategy = TestBed.inject(NgDocPreloadingStrategy);
    const preloader = TestBed.inject(NgDocRoutePreloader);

    expect(preloader.preload('/docs/next')).toBe(false);
    const load = vi.fn(() => of('loaded'));

    expect(await lastValueFrom(strategy.preload(pages.next.route, load))).toBeNull();
    expect(load).not.toHaveBeenCalled();
  });

  it('lets the router load only the routes that lead to a requested page', async () => {
    configure();
    await open('/docs/current');
    const strategy = TestBed.inject(NgDocPreloadingStrategy);
    // The router's preloader passes the routes as the router keeps them: copies of the loaded ones.
    const docs = TestBed.inject(Router).config[0] as Route & { _loadedRoutes?: Route[] };
    const other = docs._loadedRoutes?.find((route: Route) => route.path === 'other');
    const load = vi.fn(() => of('loaded'));

    expect(other).toBeDefined();
    expect(await lastValueFrom(strategy.preload(other!, load))).toBeNull();
    expect(load).not.toHaveBeenCalled();

    TestBed.inject(NgDocRoutePreloader).preload('/docs/other');
    // A failed load is no error for the router's preloader: opening the page reports it.
    const failing = vi.fn(() => throwError(() => new Error('offline')));

    expect(await lastValueFrom(strategy.preload(other!, failing))).toBeNull();
    expect(failing).toHaveBeenCalledTimes(1);
  });

  it('preloads only the documentation, and no route a guard decides', async () => {
    configure();
    await open('/docs/current');
    const preloader = TestBed.inject(NgDocRoutePreloader);

    expect(preloader.preload('/blog')).toBe(false);
    point(link('/blog'));
    expect(preloader.preload('/docs/guarded')).toBe(true);
    await turns();

    expect(blogLoads).toBe(0);
    expect(guardedLoads).toBe(0);
  });

  it('lets a later intent retry a page whose code failed to load', async () => {
    configure();
    await open('/docs/current');
    const preloader = TestBed.inject(NgDocRoutePreloader);

    expect(preloader.preload('/docs/flaky')).toBe(true);
    await turns();
    expect(flakyLoads).toBe(1);

    expect(preloader.preload('/docs/flaky')).toBe(true);
    await turns();
    expect(flakyLoads).toBe(2);
    // Loaded now: once is enough.
    expect(preloader.preload('/docs/flaky')).toBe(false);
  });

  describe('with the hash location strategy', () => {
    it('preloads the route in the fragment of a link once', async () => {
      configure([], [withHashLocation()]);
      await open('/docs/current');
      // The router keeps the route in the fragment.
      expect(TestBed.inject(LocationStrategy).path()).toBe('/docs/current');
      expect(TestBed.inject(LocationStrategy).prepareExternalUrl('/docs/current')).toBe(
        '#/docs/current',
      );

      const next = link('#/docs/next');

      point(next);
      await turns();
      expect(pages.next.chunkLoads()).toBe(1);
      expect(pages.next.contentLoads()).toBe(1);

      point(link('#/docs/next?tab=api'));
      point(link(`${location.pathname}#/docs/next`));
      await turns();
      expect(pages.next.chunkLoads()).toBe(1);

      // The link the router renders for a page under this strategy.
      const router = TestBed.inject(Router);
      const other = link(
        TestBed.inject(LocationStrategy).prepareExternalUrl(
          router.serializeUrl(router.parseUrl('/docs/other')),
        ),
      );

      expect(other.getAttribute('href')).toBe('#/docs/other');
      point(other);
      await turns();
      expect(pages.other.chunkLoads()).toBe(1);
      expect(pages.other.contentLoads()).toBe(1);
    });

    it('ignores anchors, the current page, other documents and other routes', async () => {
      configure([], [withHashLocation()]);
      await open('/docs/current');
      const before = { current: pages.current.contentLoads(), docs: docsLoads };

      point(link('#usage'));
      point(link('#/docs/current'));
      point(link('#/docs/current#usage'));
      point(link('/another-document.html#/docs/next'));
      point(link('https://example.com/#/docs/next'));
      point(link('#/blog'));
      await turns();

      expect(pages.next.chunkLoads()).toBe(0);
      expect(pages.current.contentLoads()).toBe(before.current);
      expect(docsLoads).toBe(before.docs);
      expect(blogLoads).toBe(0);
    });

    it('strips the base href that APP_BASE_HREF gives the routes', async () => {
      configure([{ provide: APP_BASE_HREF, useValue: '/app/' }], [withHashLocation()]);
      await open('/docs/current');
      expect(TestBed.inject(LocationStrategy).prepareExternalUrl('/docs/current')).toBe(
        '#/app/docs/current',
      );

      point(link('#/app/docs/next'));
      point(link('#/elsewhere/docs/other'));
      await turns();

      expect(pages.next.chunkLoads()).toBe(1);
      expect(pages.other.chunkLoads()).toBe(0);
    });
  });
});
