import {
  afterEveryRender,
  ApplicationRef,
  ChangeDetectionStrategy,
  Component,
  EnvironmentInjector,
  EnvironmentProviders,
  NgZone,
  PLATFORM_ID,
  Provider,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NavigationEnd, provideRouter, Router, RouterOutlet, Routes } from '@angular/router';
import { NgDocRootPage } from '@ng-doc/app/classes/root-page';
import { NgDocPageComponent } from '@ng-doc/app/components/page';
import { NgDocPageWrapperComponent } from '@ng-doc/app/components/page-wrapper';
import { ɵNG_DOC_CONTENT_WAIT, ɵwithNgDocContent } from '@ng-doc/app/helpers';
import { NG_DOC_CONTEXT, NG_DOC_PAGE_SKELETON } from '@ng-doc/app/tokens';
import type { NgDocContentModule, NgDocContentSource } from '@ng-doc/core/interfaces';
import { NgDocPageType } from '@ng-doc/core/types';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { describeChangeDetection } from '../change-detection/change-detection-modes';

/*
 * Client-side navigation between two generated pages whose header and body load separately, as
 * the generator writes them: the route of the page wrapper and the route of its tab each wait
 * for their content. The previous page must stay on screen until the next one is ready, and the
 * next one must render with its content, never as an empty page.
 */

interface GatedSource {
  readonly source: NgDocContentSource;
  readonly loads: () => number;
  release(): void;
}

/**
 * A content source whose loads wait until it is released.
 * @param id - The content id.
 * @param html - The content it loads.
 * @returns The source, its load count and its release.
 */
function gatedSource(id: string, html: string): GatedSource {
  let release!: () => void;
  let loads = 0;
  const gate = new Promise<void>((done) => (release = done));

  return {
    source: {
      id,
      load: async (): Promise<NgDocContentModule> => {
        loads++;
        await gate;
        return { schemaVersion: 1, id, revision: 'r1', html };
      },
    },
    loads: () => loads,
    release: () => release(),
  };
}

const sources: Record<string, { header: GatedSource; body: GatedSource }> = {};

/**
 * The header and body sources of a page in the current test.
 * @param page - The page.
 * @returns Its sources.
 */
function sourcesOf(page: string): { header: GatedSource; body: GatedSource } {
  return (sources[page] ??= {
    header: gatedSource(`${page}-header`, `<h1>Header ${page}</h1>`),
    body: gatedSource(
      `${page}-body`,
      `<p class="body">Body ${page}</p><h2 id="usage-${page}">Usage</h2>`,
    ),
  });
}

@Component({
  selector: 'ng-doc-swap-root',
  imports: [RouterOutlet],
  template: '<router-outlet />',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class SwapRootComponent {}

abstract class SwapPage extends NgDocRootPage {
  readonly pageType: NgDocPageType = 'guide';
  readonly pageContent: string = '';
  readonly editSourceFileUrl?: string;
  readonly viewSourceFileUrl?: string;
}

@Component({
  selector: 'ng-doc-swap-page-a',
  imports: [NgDocPageComponent],
  template: '<ng-doc-page />',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: NgDocRootPage, useExisting: SwapPageAComponent }],
})
class SwapPageAComponent extends SwapPage {
  override readonly pageContentSource = sourcesOf('a').body.source;
}

@Component({
  selector: 'ng-doc-swap-page-b',
  imports: [NgDocPageComponent],
  template: '<ng-doc-page />',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: NgDocRootPage, useExisting: SwapPageBComponent }],
})
class SwapPageBComponent extends SwapPage {
  override readonly pageContentSource = sourcesOf('b').body.source;
}

@Component({
  selector: 'ng-doc-swap-wrapper-a',
  imports: [NgDocPageWrapperComponent],
  template: `<ng-doc-page-wrapper [routes]="[]" headerContent="" [headerContentSource]="header" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class SwapWrapperAComponent {
  readonly header = sourcesOf('a').header.source;
}

@Component({
  selector: 'ng-doc-swap-wrapper-b',
  imports: [NgDocPageWrapperComponent],
  template: `<ng-doc-page-wrapper [routes]="[]" headerContent="" [headerContentSource]="header" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class SwapWrapperBComponent {
  readonly header = sourcesOf('b').header.source;
}

@Component({
  selector: 'ng-doc-swap-page-c',
  imports: [NgDocPageComponent],
  template: '<ng-doc-page />',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: NgDocRootPage, useExisting: SwapPageCComponent }],
})
class SwapPageCComponent extends SwapPage {
  override readonly pageContentSource = sourcesOf('c').body.source;
}

@Component({
  selector: 'ng-doc-swap-wrapper-c',
  imports: [NgDocPageWrapperComponent],
  template: `<ng-doc-page-wrapper [routes]="[]" headerContent="" [headerContentSource]="header" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class SwapWrapperCComponent {
  readonly header = sourcesOf('c').header.source;
}

/**
 * The routes of one page as the generated route files declare them, both levels lazy.
 * @param page - The path of the page.
 * @param wrapper - The page wrapper component.
 * @param component - The page component.
 * @returns The route.
 */
function pageRoute(page: string, wrapper: object, component: object): Routes[number] {
  return {
    path: page,
    loadChildren: async () => [
      ɵwithNgDocContent(
        {
          path: '',
          component: wrapper as Routes[number]['component'],
          children: [
            {
              path: '',
              loadChildren: async () => [
                ɵwithNgDocContent(
                  { path: '', component: component as Routes[number]['component'] },
                  sourcesOf(page).body.source,
                ),
              ],
            },
          ],
        },
        sourcesOf(page).header.source,
      ),
    ],
  };
}

/**
 * Where the router would scroll to an anchor, and whether the anchor was on the page then. The
 * router's scroller (set up when an application bootstraps, which a test host does not) scrolls
 * in the first timer or animation frame after `NavigationEnd`; this records the same moment.
 */
let anchorScrolls: Array<{ anchor: string; found: boolean }> = [];

/**
 * Configures a router with three generated pages and opens the first one.
 * @param providers - The change detection providers and any others.
 * @param open - Whether to open the first page.
 * @returns The host element and the renders it showed.
 */
async function setup(
  providers: Array<Provider | EnvironmentProviders>,
  open: boolean = true,
): Promise<{ host: HTMLElement; frames: string[] }> {
  for (const key of Object.keys(sources)) delete sources[key];
  // The page classes read their sources when they are created, so new gated sources for this
  // test are made before any page is.
  ['a', 'b', 'c'].forEach((page) => sourcesOf(page));
  anchorScrolls = [];
  TestBed.configureTestingModule({
    providers: [
      provideRouter([
        pageRoute('a', SwapWrapperAComponent, SwapPageAComponent),
        pageRoute('b', SwapWrapperBComponent, SwapPageBComponent),
        pageRoute('c', SwapWrapperCComponent, SwapPageCComponent),
      ]),
      { provide: NG_DOC_PAGE_SKELETON, useValue: {} },
      { provide: NG_DOC_CONTEXT, useValue: { navigation: [] } },
      ...providers,
    ],
  });

  const fixture = TestBed.createComponent(SwapRootComponent);
  const host: HTMLElement = fixture.nativeElement;
  const frames: string[] = [];
  const router = TestBed.inject(Router);

  router.events.subscribe((event) => {
    const anchor = event instanceof NavigationEnd && router.parseUrl(event.url).fragment;

    if (anchor) {
      setTimeout(() => anchorScrolls.push({ anchor, found: !!document.getElementById(anchor) }));
    }
  });

  afterEveryRender(() => frames.push(shown(host)), {
    injector: TestBed.inject(EnvironmentInjector),
  });
  if (open) {
    sourcesOf('a').header.release();
    sourcesOf('a').body.release();
    await TestBed.inject(Router).navigateByUrl('/a');
    await settle();
  }

  return { host, frames };
}

/**
 * The text of the shown page, `empty` when a page is shown without content.
 * @param host - The host element.
 * @returns What the page shows.
 */
function shown(host: HTMLElement): string {
  const page = host.querySelector('ng-doc-page');

  if (!page) return 'none';

  const header = host.querySelector('ng-doc-page-header')?.textContent?.trim() ?? '';
  const body = page.querySelector('.body')?.textContent?.trim() ?? '';

  return header && body ? `${header} | ${body}` : 'empty';
}

/**
 * Waits for some macrotasks.
 * @param count - How many.
 * @param delay - The delay of each, in milliseconds.
 */
async function turns(count: number = 5, delay: number = 0): Promise<void> {
  for (let turn = 0; turn < count; turn++) await new Promise((done) => setTimeout(done, delay));
}

/** Waits until the application is stable for a while. */
async function settle(): Promise<void> {
  for (let round = 0; round < 3; round++) {
    await TestBed.inject(ApplicationRef).whenStable();
    await turns(1);
  }
}

describeChangeDetection('Navigation between generated pages', ({ providers }) => {
  /** What every render showed: the header and body texts, or `empty` for a blank page. */
  let frames: string[];
  let host: HTMLElement;

  beforeEach(async () => {
    ({ host, frames } = await setup(providers));
  });

  afterEach(() => TestBed.resetTestingModule());

  it('renders the first page with its content', () => {
    expect(shown(host)).toBe('Header a | Body a');
    expect(frames).not.toContain('empty');
  });

  it('keeps the previous page until the next page has its content, then swaps', async () => {
    const navigation = TestBed.inject(Router).navigateByUrl('/b');

    await turns();
    // Both levels of the next page have loaded their code; their content has not arrived.
    expect(sourcesOf('b').header.loads()).toBe(1);
    expect(sourcesOf('b').body.loads()).toBe(1);
    expect(shown(host)).toBe('Header a | Body a');

    sourcesOf('b').header.release();
    await turns();
    expect(shown(host)).toBe('Header a | Body a');

    sourcesOf('b').body.release();
    await expect(navigation).resolves.toBe(true);
    await settle();

    expect(shown(host)).toBe('Header b | Body b');
    // No render ever showed a page without its content.
    expect(frames).not.toContain('empty');
    expect(frames).not.toContain('none');
    // The pages render the preloaded content and do not load their sources again.
    expect(sourcesOf('b').header.loads()).toBe(1);
    expect(sourcesOf('b').body.loads()).toBe(1);
  });

  it('shows the next page when its content fails to load', async () => {
    const failing = sourcesOf('b').body.source as { load: NgDocContentSource['load'] };

    failing.load = async () => {
      throw new Error('Content unavailable');
    };
    sourcesOf('b').header.release();

    await expect(TestBed.inject(Router).navigateByUrl('/b')).resolves.toBe(true);
    await settle();

    expect(host.querySelector('ng-doc-page [role="alert"]')?.textContent).toContain(
      'Content unavailable',
    );
  });

  it('replaces a navigation that is waiting for content by a later one', async () => {
    const router = TestBed.inject(Router);
    const toB = router.navigateByUrl('/b');

    await turns();
    sourcesOf('c').header.release();
    sourcesOf('c').body.release();
    const toC = router.navigateByUrl('/c');

    await expect(toB).resolves.toBe(false);
    await expect(toC).resolves.toBe(true);
    await settle();
    expect(shown(host)).toBe('Header c | Body c');

    // The superseded page's content arriving later changes nothing.
    sourcesOf('b').header.release();
    sourcesOf('b').body.release();
    await settle();
    expect(shown(host)).toBe('Header c | Body c');
    expect(router.url).toBe('/c');
    expect(frames).not.toContain('empty');
    expect(frames).not.toContain('none');
  });

  it('scrolls to the anchor of the next page once it is on the page', async () => {
    sourcesOf('b').header.release();
    sourcesOf('b').body.release();
    await TestBed.inject(Router).navigateByUrl('/b#usage-b');
    await settle();

    expect(shown(host)).toBe('Header b | Body b');
    expect(anchorScrolls).toEqual([{ anchor: 'usage-b', found: true }]);
  });
});

describeChangeDetection('Navigation with stalled content', ({ providers }) => {
  let frames: string[];
  let host: HTMLElement;

  beforeEach(async () => {
    ({ host, frames } = await setup([
      ...providers,
      { provide: ɵNG_DOC_CONTENT_WAIT, useValue: 300 },
    ]));
  });

  afterEach(() => TestBed.resetTestingModule());

  it('opens the page after the wait and renders its content when it arrives', async () => {
    const started = performance.now();
    const navigation = TestBed.inject(Router).navigateByUrl('/b');

    await turns(2);
    expect(shown(host)).toBe('Header a | Body a');
    // The wait is over: the page opens without its content instead of freezing navigation.
    await expect(navigation).resolves.toBe(true);
    // One wait for the whole navigation, although the wrapper and the tab each have a resolver.
    expect(performance.now() - started).toBeLessThan(550);
    await turns(5, 10);
    expect(shown(host)).toBe('empty');

    sourcesOf('b').header.release();
    sourcesOf('b').body.release();
    await settle();
    expect(shown(host)).toBe('Header b | Body b');
    // The page waited for the load the router started instead of starting another.
    expect(sourcesOf('b').header.loads()).toBe(1);
    expect(sourcesOf('b').body.loads()).toBe(1);
    expect(frames.at(-1)).toBe('Header b | Body b');
  });
});

describeChangeDetection('Server rendering of a generated page', ({ providers }) => {
  const globals = globalThis as { ngServerMode?: boolean };
  const serverMode = globals.ngServerMode;

  beforeEach(() => {
    globals.ngServerMode = true;
  });

  afterEach(() => {
    globals.ngServerMode = serverMode;
    TestBed.resetTestingModule();
  });

  it('becomes stable with the content rendered, without waiting out the timer', async () => {
    const { host } = await setup(
      [...providers, { provide: PLATFORM_ID, useValue: 'server' }],
      false,
    );
    const started = performance.now();
    // As on a server, the navigation runs in the application's zone (when it has one), whose
    // stability counts pending timers.
    const navigation = TestBed.inject(NgZone).run(() => TestBed.inject(Router).navigateByUrl('/a'));

    setTimeout(() => {
      sourcesOf('a').header.release();
      sourcesOf('a').body.release();
    }, 20);
    await expect(navigation).resolves.toBe(true);
    await TestBed.inject(ApplicationRef).whenStable();

    expect(shown(host)).toBe('Header a | Body a');
    // The resolver cleared its timer: the server render did not wait the 8 s out.
    expect(performance.now() - started).toBeLessThan(4000);
  });
});
