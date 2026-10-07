import { ChangeDetectionStrategy, Component, inject, InjectionToken } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { provideRouter, Route, RouterOutlet, Routes } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { NgDocTitleContext, provideNgDocTitle } from '@ng-doc/app/providers/title';
import { beforeEach, expect, it } from 'vitest';

import { describeChangeDetection } from '../change-detection/change-detection-modes';

/*
 * The routes below have the shape of the generated ones: `routes.ts` gives categories and pages a
 * title and an `ngDocTitle` kind, a page's `page.ts` loads its wrapper route (no title, the page
 * type in `ngDocPageType`), whose children are the tab routes (a title, kind `tab`), and each tab
 * loads the page route, which spreads the page's own `route` and has no title of its own.
 */

@Component({
  selector: 'ng-doc-test-outlet',
  template: '<router-outlet />',
  imports: [RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class OutletComponent {}

@Component({
  selector: 'ng-doc-test-page',
  template: 'page',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class PageComponent {}

interface TestTab {
  path: string;
  title: string;
  route?: Route;
}

/**
 * Routes of a generated page (`page-wrapper.ts.nunj` and `page.ts.nunj`).
 * @param pageType - The page type.
 * @param tabs - The tabs of the page.
 * @returns The routes the page's route loads.
 */
function pageRoutes(pageType: 'guide' | 'api', tabs: TestTab[]): Routes {
  return [
    {
      path: '',
      component: OutletComponent,
      data: { ngDocPageType: pageType },
      children: tabs.map((tab: TestTab) => ({
        path: tab.path,
        loadChildren: async () => [{ ...tab.route, path: '', component: PageComponent }],
        title: tab.title,
        data: { icon: '', ngDocTitle: 'tab' },
      })),
    },
  ];
}

const NG_DOC_ROUTING: Routes = [
  {
    path: 'get-started',
    title: 'Getting started',
    data: { ngDocTitle: 'category' },
    children: [
      { path: '', redirectTo: 'installation', pathMatch: 'full' },
      {
        path: 'installation',
        title: 'Installation',
        data: { ngDocTitle: 'page' },
        loadChildren: async () => pageRoutes('guide', [{ path: '', title: 'Installation' }]),
      },
      {
        path: 'own-title',
        title: 'Own title',
        data: { ngDocTitle: 'page' },
        loadChildren: async () =>
          pageRoutes('guide', [
            { path: '', title: 'Own title', route: { title: 'A title of its own' } },
          ]),
      },
      {
        path: 'nested',
        title: 'Nested',
        data: { ngDocTitle: 'category' },
        children: [
          {
            path: 'tabs',
            title: 'Tabs',
            data: { ngDocTitle: 'page' },
            loadChildren: async () =>
              pageRoutes('guide', [
                { path: '', title: 'Overview' },
                { path: 'api', title: 'API' },
              ]),
          },
          {
            path: 'first-tab',
            title: 'First tab',
            data: { ngDocTitle: 'page' },
            loadChildren: async () =>
              pageRoutes('guide', [
                { path: '', title: 'First tab' },
                { path: 'more', title: 'More' },
              ]),
          },
        ],
      },
    ],
  },
  {
    path: 'api/classes/app/NgDocThing',
    title: 'NgDocThing',
    data: { ngDocTitle: 'page' },
    loadChildren: async () => pageRoutes('api', [{ path: '', title: 'NgDocThing' }]),
  },
];

const ROUTES: Routes = [
  { path: 'docs', component: OutletComponent, children: NG_DOC_ROUTING },
  { path: '', component: PageComponent, title: 'Home' },
  { path: 'untitled', component: PageComponent },
];

const SUFFIX = new InjectionToken<string>('SUFFIX');

/** The router harness of the current test; a test can create only one. */
let harness: RouterTestingHarness | undefined;

beforeEach(() => {
  harness = undefined;
});

/**
 * Navigates and returns the document title.
 * @param url - The URL to navigate to.
 * @returns The document title after the navigation.
 */
async function titleAt(url: string): Promise<string> {
  harness ??= await RouterTestingHarness.create();

  await harness.navigateByUrl(url);

  return TestBed.inject(Title).getTitle();
}

describeChangeDetection('default title', ({ providers }) => {
  it('is the title of the deepest route, and a page’s own route title wins', async () => {
    TestBed.configureTestingModule({ providers: [...providers, provideRouter(ROUTES)] });

    expect(await titleAt('/docs/get-started/installation')).toBe('Installation');
    expect(await titleAt('/docs/get-started/own-title')).toBe('A title of its own');
    expect(await titleAt('/docs/get-started/nested/tabs/api')).toBe('API');
    expect(await titleAt('/docs/api/classes/app/NgDocThing')).toBe('NgDocThing');
  });
});

describeChangeDetection('provideNgDocTitle', ({ providers }) => {
  /**
   * Configures the title function and records the contexts it receives.
   * @param result - The title the function returns.
   * @returns The received contexts.
   */
  function setUp(
    result: (context: NgDocTitleContext) => string | undefined = ({ page, api, title }) =>
      api ?? page ?? title,
  ): NgDocTitleContext[] {
    const contexts: NgDocTitleContext[] = [];

    TestBed.configureTestingModule({
      providers: [
        ...providers,
        provideRouter(ROUTES),
        { provide: SUFFIX, useValue: ' | Docs' },
        provideNgDocTitle((context: NgDocTitleContext) => {
          contexts.push(context);

          return result(context);
        }),
      ],
    });

    return contexts;
  }

  /**
   * The context without its router state, for comparisons.
   * @param context - The context.
   * @returns The context's titles.
   */
  function parts(context: NgDocTitleContext): object {
    const { title, categories, page, tab, api } = context;

    return { title, categories, page, tab, api };
  }

  it('passes the categories and the page of a guide, without repeated titles', async () => {
    const contexts = setUp();

    expect(await titleAt('/docs/get-started/installation')).toBe('Installation');
    expect(parts(contexts.at(-1)!)).toEqual({
      title: 'Installation',
      categories: ['Getting started'],
      page: 'Installation',
      tab: undefined,
      api: undefined,
    });
    expect(contexts.at(-1)!.snapshot.url).toBe('/docs/get-started/installation');
  });

  it('passes the active tab of a page with tabs and every category, outermost first', async () => {
    const contexts = setUp();

    await titleAt('/docs/get-started/nested/tabs/api');
    expect(parts(contexts.at(-1)!)).toEqual({
      title: 'API',
      categories: ['Getting started', 'Nested'],
      page: 'Tabs',
      tab: 'API',
      api: undefined,
    });

    await titleAt('/docs/get-started/nested/tabs');
    expect(contexts.at(-1)!.tab).toBe('Overview');

    // A tab titled like its page, as the first tab of a page usually is, is not a tab title.
    await titleAt('/docs/get-started/nested/first-tab');
    expect(contexts.at(-1)!.tab).toBeUndefined();
    await titleAt('/docs/get-started/nested/first-tab/more');
    expect(contexts.at(-1)!.tab).toBe('More');
  });

  it('passes a page’s own route title as its page title', async () => {
    const contexts = setUp();

    await titleAt('/docs/get-started/own-title');
    expect(parts(contexts.at(-1)!)).toEqual({
      title: 'A title of its own',
      categories: ['Getting started'],
      page: 'A title of its own',
      tab: undefined,
      api: undefined,
    });
  });

  it('passes the declaration name of an API page as `api`', async () => {
    const contexts = setUp();

    expect(await titleAt('/docs/api/classes/app/NgDocThing')).toBe('NgDocThing');
    expect(parts(contexts.at(-1)!)).toEqual({
      title: 'NgDocThing',
      categories: [],
      page: undefined,
      tab: undefined,
      api: 'NgDocThing',
    });
  });

  it('passes only the default title outside the documentation', async () => {
    const contexts = setUp();

    expect(await titleAt('/')).toBe('Home');
    expect(parts(contexts.at(-1)!)).toEqual({
      title: 'Home',
      categories: [],
      page: undefined,
      tab: undefined,
      api: undefined,
    });
  });

  it('composes titles and runs in an injection context', async () => {
    setUp(({ categories, page, tab }) =>
      page
        ? [tab, page, ...[...categories].reverse()].filter(Boolean).join(' · ') + inject(SUFFIX)
        : undefined,
    );

    expect(await titleAt('/docs/get-started/installation')).toBe(
      'Installation · Getting started | Docs',
    );
    expect(await titleAt('/docs/get-started/nested/tabs/api')).toBe(
      'API · Tabs · Nested · Getting started | Docs',
    );
  });

  it('keeps the current title when the function returns undefined', async () => {
    setUp(() => undefined);
    TestBed.inject(Title).setTitle('Before');

    expect(await titleAt('/untitled')).toBe('Before');
    expect(await titleAt('/docs/get-started/installation')).toBe('Before');
  });
});
