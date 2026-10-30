import { DOCUMENT, ViewportScroller } from '@angular/common';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationRef, ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Routes } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { ɵrestoreNgDocHydrationSnapshot } from '@ng-doc/app/helpers';
import { NgDocContentScrollIntent } from '@ng-doc/app/services/content-scroll-intent';
import { NgDocHighlighterService } from '@ng-doc/app/services/highlighter';
import { WA_LOCAL_STORAGE } from '@ng-web-apis/common';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { describeChangeDetection } from '../change-detection/change-detection-modes';
import { APP_SCROLL_OFFSET, appProviders } from './fixture/app.config';
import { routes } from './fixture/app.routes';
import { provideFixtureDocs } from './fixture/docs/providers';

/*
 * The lazy-route fixture (an application that holds NgDoc and all its providers in a lazy `/docs`
 * route) rendered with its own routes: NgDoc works there, and the application's other pages keep
 * their scroll offset and their keys. bundle.test.mjs checks the production build of the same
 * fixture.
 */

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

/** Whether a page component was created with the server-rendered copy of its host shown. */
@Component({
  selector: 'ng-doc-snapshot-probe',
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class SnapshotProbeComponent {
  readonly snapshotShown: boolean;

  constructor() {
    const host = inject(DOCUMENT).querySelector('ng-doc-page')!;

    ɵrestoreNgDocHydrationSnapshot(host);
    this.snapshotShown = host.hasAttribute('data-ng-doc-hydration-snapshot');
  }
}

describeChangeDetection('NgDoc under a lazy route', ({ providers }) => {
  let scrollTo: ReturnType<typeof vi.spyOn>;

  /**
   * Configures the fixture application and returns its router harness.
   * @param extraRoutes - Routes added to the fixture's routes.
   */
  async function createApp(extraRoutes: Routes = []): Promise<RouterTestingHarness> {
    TestBed.configureTestingModule({
      providers: [
        ...providers,
        ...appProviders,
        provideRouter([...extraRoutes, ...routes]),
        provideHttpClientTesting(),
        { provide: WA_LOCAL_STORAGE, useValue: new MemoryStorage() },
      ],
    });

    return RouterTestingHarness.create();
  }

  /**
   * Opens a URL and waits until the application is stable.
   * @param harness - The router harness.
   * @param url - The URL to open.
   */
  async function open(harness: RouterTestingHarness, url: string): Promise<void> {
    await harness.navigateByUrl(url);
    await TestBed.inject(ApplicationRef).whenStable();
  }

  /** The vertical scroll offset the router applies to anchors now. */
  function scrollOffset(): number {
    const anchor = document.createElement('div');

    anchor.id = 'lazy-route-probe';
    document.body.append(anchor);
    scrollTo.mockClear();

    try {
      TestBed.inject(ViewportScroller).scrollToAnchor('lazy-route-probe');
    } finally {
      anchor.remove();
    }

    // jsdom lays nothing out: the anchor is at the top, so the router scrolls to minus the offset.
    return 0 - (scrollTo.mock.calls[0][0] as ScrollToOptions).top!;
  }

  /**
   * Presses the T key (the shortcut that switches the theme) on the page.
   * @returns Whether a shortcut handled it.
   */
  function pressT(): boolean {
    const event = new KeyboardEvent('keydown', { key: 't', bubbles: true, cancelable: true });

    document.body.dispatchEvent(event);

    return event.defaultPrevented;
  }

  beforeEach(() => {
    scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    // jsdom implements no Web Animations; the overlay container awaits `animate().finished`.
    Object.defineProperty(Element.prototype, 'animate', {
      configurable: true,
      value: () => ({ finished: Promise.resolve() }) as unknown as Animation,
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    delete (Element.prototype as Partial<Element>).animate;
    scrollTo.mockRestore();
    document.documentElement.removeAttribute('data-theme');
    document.querySelectorAll('ng-doc-page').forEach((element) => element.remove());
  });

  it('applies the scroll offset and the shortcuts only inside the documentation', async () => {
    const harness = await createApp();

    await open(harness, '/');
    expect(harness.routeNativeElement?.textContent).toContain('Home');
    expect(scrollOffset()).toBe(APP_SCROLL_OFFSET[1]);
    expect(pressT()).toBe(false);

    await open(harness, '/docs');
    const root = harness.fixture.nativeElement.querySelector('ng-doc-root') as HTMLElement;
    const main = root.querySelector('main') as HTMLElement;

    expect(root.querySelector('h1')?.textContent).toBe('Guide');
    // The layout makes room for the application's 48px header (`--ng-doc-layout-top`); jsdom
    // resolves no CSS variables, so the margin is set as the browser would compute it.
    main.style.marginTop = '48px';
    expect(scrollOffset()).toBe(120 + 48);
    expect(pressT()).toBe(true);

    await open(harness, '/');
    expect(harness.fixture.nativeElement.querySelector('ng-doc-root')).toBeNull();
    expect(scrollOffset()).toBe(APP_SCROLL_OFFSET[1]);
    expect(pressT()).toBe(false);
  });

  it('starts NgDoc with the documentation route and waits for the highlighter', async () => {
    const harness = await createApp();

    await open(harness, '/docs/guide');

    // The route's own instance: it reads the generated context that the route provides.
    const highlighter = harness.routeDebugElement!.injector.get(NgDocHighlighterService);

    // The documentation's start waited for Shiki, as a server render does.
    expect(highlighter.ready()).toBe(true);
  });

  it('opens the search palette with the providers of the route', async () => {
    const harness = await createApp();

    await open(harness, '/docs/guide');
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true }),
    );
    await TestBed.inject(ApplicationRef).whenStable();

    const palette = document.querySelector('ng-doc-command-palette');

    expect(palette).not.toBeNull();
    expect(palette?.querySelector('[role="combobox"]')).not.toBeNull();
  });

  it('replays the anchor of a first navigation into the documentation', async () => {
    const harness = await createApp();
    const anchors: string[] = [];

    TestBed.inject(NgDocContentScrollIntent).subscribe((intent) => {
      if (intent) anchors.push(intent.anchor);
    });
    await open(harness, '/docs/guide#intro');

    expect(anchors).toEqual(['intro']);
  });

  it.each([
    [true, provideFixtureDocs()],
    [false, []],
  ])(
    'shows the server-rendered page when the documentation is the first route (%s)',
    async (shown, routeProviders) => {
      const host = document.createElement('ng-doc-page');

      host.setAttribute('ngskiphydration', '');
      host.setAttribute('data-ng-doc-async-content', '');
      host.innerHTML = '<p>Server-rendered page</p>';
      document.body.append(host);

      const harness = await createApp([
        {
          path: 'first',
          providers: routeProviders,
          loadChildren: () => Promise.resolve([{ path: '', component: SnapshotProbeComponent }]),
        },
      ]);
      const probe = (await harness.navigateByUrl('/first')) as SnapshotProbeComponent;

      // The route's environment initializers copy the server-rendered page before the router
      // creates the page; without NgDoc's providers on the route nothing is copied.
      expect(probe.snapshotShown).toBe(shown);
    },
  );
});
