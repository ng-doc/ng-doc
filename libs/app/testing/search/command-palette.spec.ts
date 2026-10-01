import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ChangeDetectionStrategy, Component, Provider, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router, Routes } from '@angular/router';
import { NgDocSearchEngine } from '@ng-doc/app/classes/search-engine';
import { NgDocCommandPaletteComponent } from '@ng-doc/app/components/command-palette';
import { NgDocSearchComponent } from '@ng-doc/app/components/search';
import { NgDocSearchResult } from '@ng-doc/app/interfaces';
import { NG_DOC_STORE_SHORTCUTS_KEY, NgDocShortcutsService } from '@ng-doc/app/services/shortcuts';
import { NgDocThemeService } from '@ng-doc/app/services/theme';
import { NG_DOC_CONTEXT } from '@ng-doc/app/tokens';
import type { NgDocApiList, NgDocPageIndex } from '@ng-doc/core/interfaces';
import { NG_DOC_DIALOG_DATA } from '@ng-doc/ui-kit';
import { NgDocOverlayRef } from '@ng-doc/ui-kit/classes';
import { WA_LOCAL_STORAGE } from '@ng-web-apis/common';
import { Observable, of, Subject, throwError } from 'rxjs';
import { type Mock, afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';

import { describeChangeDetection } from '../change-detection/change-detection-modes';

class MemoryStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const API_LIST: NgDocApiList[] = [
  {
    title: '@ng-doc/app',
    items: [
      {
        route: '/docs/api/classes/app/NgDocThemeService',
        type: 'Injectable',
        name: 'NgDocThemeService',
      },
      { route: '/docs/api/interfaces/app/NgDocTheme', type: 'Interface', name: 'NgDocTheme' },
      {
        route: '/docs/api/classes/app/NgDocSidebarService',
        type: 'Injectable',
        name: 'NgDocSidebarService',
      },
    ],
  },
];

/**
 * Routes of an API entry: the index route and one route per declaration page, as the builders
 * generate them.
 * @param entry - The route of the API entry.
 * @param pages - Declaration page routes under the entry.
 */
function apiRoutes(entry: string, pages: string[]): Routes {
  return [
    { path: entry, children: [] },
    ...pages.map((page) => ({ path: `${entry}/${page}`, children: [] })),
  ];
}

/** The routes of the default API entry of the specs, whose list is the root list. */
const API_ROUTES: Routes = [
  {
    path: 'docs',
    children: apiRoutes('api', [
      'classes/app/NgDocThemeService',
      'interfaces/app/NgDocTheme',
      'classes/app/NgDocSidebarService',
    ]),
  },
];

/**
 * A search result.
 * @param index - The page index fields that differ from a guide page.
 */
function hit(index: Partial<NgDocPageIndex>): NgDocSearchResult {
  return {
    index: {
      breadcrumbs: ['Customization', 'Themes'],
      title: 'Themes',
      section: '',
      pageType: 'guide',
      route: 'docs/customization/themes',
      ...index,
    },
    positions: {},
  };
}

const HITS: NgDocSearchResult[] = [
  hit({ content: 'How to change the theme.' }),
  hit({ section: 'Dark mode', fragment: 'dark-mode', content: 'The dark theme.' }),
  hit({ section: 'Dark mode', fragment: 'dark-mode', content: 'A second match in the section.' }),
  hit({
    pageType: 'api',
    breadcrumbs: ['API References', '@ng-doc/app', 'NgDocTheme'],
    title: 'NgDocTheme',
    route: 'docs/api/interfaces/app/NgDocTheme',
    content: 'Theme description: id and path to its stylesheet.',
  }),
];

class FakeSearchEngine extends NgDocSearchEngine {
  readonly queries: string[] = [];
  result: () => Observable<NgDocSearchResult[]> = () => of(HITS);

  search(query: string): Observable<NgDocSearchResult[]> {
    this.queries.push(query);

    return this.result();
  }
}

/**
 * Waits for the search debounce and the next render.
 * @param fixture - The fixture to settle.
 * @param ms - How long to wait between the two stability checks.
 */
async function settle(fixture: ComponentFixture<unknown>, ms: number = 0): Promise<void> {
  await fixture.whenStable();
  await new Promise((resolve) => setTimeout(resolve, ms));
  await fixture.whenStable();
}

/**
 * Dispatches a keydown event.
 * @param target - The element that has focus.
 * @param key - The key.
 * @param init - More event fields.
 */
function press(target: EventTarget, key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });

  target.dispatchEvent(event);

  return event;
}

/**
 * Types a query into the search field.
 * @param input - The search field.
 * @param value - The query.
 */
function type(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

describeChangeDetection('NgDocCommandPaletteComponent', ({ providers }) => {
  let fixture: ComponentFixture<NgDocCommandPaletteComponent>;
  let engine: FakeSearchEngine;
  let overlayRef: { close: Mock };
  let storage: MemoryStorage;
  let http: HttpTestingController;
  let element: HTMLElement;

  const input = () => element.querySelector<HTMLInputElement>('input[role="combobox"]')!;
  const options = () => [...element.querySelectorAll<HTMLElement>('[role="option"]')];
  const selected = () =>
    element.querySelector<HTMLElement>('[role="option"][aria-selected="true"]');
  const sections = () =>
    [...element.querySelectorAll('[role="group"]')].map((group) =>
      group.getAttribute('aria-label'),
    );
  const tabs = () => [...element.querySelectorAll<HTMLElement>('[role="tab"]')];
  const apiOptions = () => options().filter((option) => option.dataset['ngDocType'] === 'api');

  /**
   * Moves the selection down with the arrow key.
   * @param steps - How many rows to move.
   */
  async function moveDown(steps: number): Promise<void> {
    for (let step = 0; step < steps; step++) {
      press(input(), 'ArrowDown');
    }
    await settle(fixture);
  }
  const switchButton = () => element.querySelector<HTMLElement>('[role="switch"]')!;

  /**
   * Creates the palette, answers its API list request and waits for the render.
   * @param query - The query the palette opens with.
   */
  async function create(
    query: string = '',
    routes: Routes = API_ROUTES,
    answer: () => void = () => http.expectOne('assets/ng-doc/api-list.json').flush(API_LIST),
    extra: Provider[] = [],
  ): Promise<void> {
    TestBed.configureTestingModule({
      providers: [
        providers,
        extra,
        provideRouter(routes),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: NgDocSearchEngine, useValue: engine },
        { provide: NgDocOverlayRef, useValue: overlayRef },
        { provide: NG_DOC_DIALOG_DATA, useValue: { query } },
        { provide: WA_LOCAL_STORAGE, useValue: storage },
        {
          provide: NgDocThemeService,
          useValue: { theme: signal(null), set: vi.fn() },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(NgDocCommandPaletteComponent);
    element = fixture.nativeElement;
    // The API list requests are pending tasks, so stability waits for them: answer them first.
    TestBed.tick();
    await answer();
    await settle(fixture);
  }

  /**
   * Types a query and waits for the search debounce.
   * @param query - The query.
   */
  async function search(query: string): Promise<void> {
    type(input(), query);
    await settle(fixture, 150);
  }

  beforeEach(() => {
    engine = new FakeSearchEngine();
    overlayRef = { close: vi.fn() };
    storage = new MemoryStorage();
  });

  afterEach(() => http.verify());

  it('exposes the search field as a combobox that controls the results listbox', async () => {
    await create();
    const listbox = element.querySelector('[role="listbox"]')!;

    expect(element.querySelector('[role="dialog"]')?.getAttribute('aria-modal')).toBe('true');
    expect(input().getAttribute('aria-controls')).toBe(listbox.id);
    expect(input().getAttribute('aria-expanded')).toBe('true');
    expect(input().getAttribute('aria-autocomplete')).toBe('list');
    expect(document.activeElement).toBe(input());
    expect(input().getAttribute('aria-activedescendant')).toBe(selected()?.id);
  });

  it('lists the actions before a query and searches once typing pauses', async () => {
    await create();

    expect(sections()).toEqual(['Actions']);
    expect(engine.queries).toEqual([]);

    await search('theme');

    expect(engine.queries).toEqual(['theme']);
    expect(sections()).toEqual(['Guides', 'API', 'Actions']);
  });

  it('lists the guides above the API and selects the first guide', async () => {
    await create();
    await search('theme');

    const types = options().map((option) => option.dataset['ngDocType']);

    expect(types.lastIndexOf('guide')).toBeLessThan(types.indexOf('api'));
    expect(selected()?.dataset['ngDocType']).toBe('guide');
  });

  it('pins declarations whose name starts with the query above the guides', async () => {
    await create();
    await search('ngdocthe');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

    expect(sections()[0]).toBe('Top matches');
    expect(sections()).toContain('Guides');
    expect(selected()?.querySelector('.ng-doc-command-palette-label')?.textContent?.trim()).toBe(
      'NgDocTheme',
    );

    press(input(), 'Enter');
    await settle(fixture);

    expect(navigate).toHaveBeenCalledWith('/docs/api/interfaces/app/NgDocTheme');
  });

  it('does not pin declarations for queries shorter than three letters', async () => {
    await create();
    await search('ng');

    expect(sections()).not.toContain('Top matches');
  });

  it('keeps the result the reader moved to when the search results arrive', async () => {
    const results = new Subject<NgDocSearchResult[]>();
    // The pending search keeps the application unstable, so this test renders by hand.
    const render = async (ms: number = 0): Promise<void> => {
      await new Promise((resolve) => setTimeout(resolve, ms));
      TestBed.tick();
    };

    engine.result = () => results;
    await create();
    type(input(), 'theme');
    await render(150);

    // Only the declaration names are known yet; the reader moves to the second one.
    expect(sections()).toEqual(['API', 'Actions']);
    press(input(), 'ArrowDown');
    await render();
    expect(selected()?.querySelector('.ng-doc-command-palette-label')?.textContent?.trim()).toBe(
      'NgDocThemeService',
    );

    results.next(HITS);
    results.complete();
    await settle(fixture);

    expect(sections()).toEqual(['Guides', 'API', 'Actions']);
    expect(selected()?.querySelector('.ng-doc-command-palette-label')?.textContent?.trim()).toBe(
      'NgDocThemeService',
    );
  });

  it('selects the first result for a new query after the reader moved', async () => {
    await create();
    await search('theme');
    await moveDown(2);
    await search('dark');

    expect(selected()).toBe(options()[0]);
  });

  it('matches declaration names, shows their kind and merges search results', async () => {
    await create();
    await search('theme');

    const api = options().filter((option) => option.dataset['ngDocType'] === 'api');

    expect(
      api.map((option) =>
        option.querySelector('.ng-doc-command-palette-label')?.textContent?.trim(),
      ),
    ).toEqual(['NgDocTheme', 'NgDocThemeService']);
    expect(api[0].querySelector('mark')?.textContent).toBe('Theme');
    expect(api[0].querySelector('ng-doc-kind-icon')?.getAttribute('data-ng-doc-kind')).toBe(
      'Interface',
    );
    expect(api[0].querySelector('ng-doc-kind-icon')?.textContent).toBe('Interface');
    expect(api[0].querySelector('small')?.textContent).toBe('@ng-doc/app');
  });

  it('shows each guide section once, with its path', async () => {
    await create();
    await search('theme');

    const guides = options().filter((option) => option.dataset['ngDocType'] === 'guide');

    expect(guides.map((option) => option.querySelector('small')?.textContent)).toEqual([
      'Customization',
      'Customization › Themes',
    ]);
  });

  it('moves the selection with the arrow keys, wrapping at both ends', async () => {
    await create();
    await search('theme');
    const count = options().length;

    expect(selected()).toBe(options()[0]);

    press(input(), 'ArrowUp');
    await settle(fixture);
    expect(selected()).toBe(options()[count - 1]);

    press(input(), 'ArrowDown');
    press(input(), 'ArrowDown');
    await settle(fixture);
    expect(selected()).toBe(options()[1]);
    expect(input().getAttribute('aria-activedescendant')).toBe(options()[1].id);
  });

  it('previews the selected result', async () => {
    await create();
    await search('theme');
    await moveDown(options().indexOf(apiOptions()[0]));

    const preview = element.querySelector('.ng-doc-command-palette-preview')!;

    expect(preview.hasAttribute('aria-live')).toBe(false);
    expect(preview.querySelector('h2')?.textContent?.trim()).toBe('NgDocTheme');
    expect(preview.textContent).toContain('Theme description: id and path to its stylesheet.');
    expect(preview.textContent).toContain('@ng-doc/app');
  });

  it('previews the signature and the description of a symbol from its summary record', async () => {
    const page = {
      pageType: 'api' as const,
      breadcrumbs: ['API References', '@ng-doc/app', 'NgDocThemeService'],
      title: 'NgDocThemeService',
      route: 'docs/api/classes/app/NgDocThemeService',
    };

    // The summary sits on one record of the page; another record of the page outside a section
    // comes first among the hits.
    engine.result = () =>
      of([
        hit({ ...page, content: 'It follows every set() call.' }),
        hit({
          ...page,
          content: 'Service for managing themes. It follows every set() call.',
          kind: 'Injectable',
          signature: '@Injectable()\nexport class NgDocThemeService',
          description: 'Service for managing themes.',
        }),
      ]);
    await create();
    await search('NgDocThemeService');

    const preview = element.querySelector('.ng-doc-command-palette-preview')!;

    expect(preview.querySelector('h2')?.textContent?.trim()).toBe('NgDocThemeService');
    expect(preview.querySelector('.ng-doc-command-palette-signature')?.textContent).toBe(
      '@Injectable()\nexport class NgDocThemeService',
    );
    expect(preview.textContent).toContain('Service for managing themes.');
    expect(preview.textContent).not.toContain('It follows every set() call.');
  });

  it('previews the summary of a page whose hit is another record than its summary record', async () => {
    // The query matches a later paragraph of the page, not the symbol's name, and the search
    // returns no summary record: the preview takes the summary from the API list by route.
    engine.result = () =>
      of([
        hit({
          pageType: 'api',
          breadcrumbs: ['API References', '@ng-doc/app', 'NgDocThemeService'],
          title: 'NgDocThemeService',
          route: 'docs/api/classes/app/NgDocThemeService',
          content: 'It follows every set() call.',
        }),
      ]);
    await create('', API_ROUTES, () =>
      http.expectOne('assets/ng-doc/api-list.json').flush([
        {
          title: '@ng-doc/app',
          items: [
            {
              route: '/docs/api/classes/app/NgDocThemeService',
              type: 'Injectable',
              name: 'NgDocThemeService',
              description: 'Service for managing themes.',
              signature: '@Injectable()\nexport class NgDocThemeService',
            },
          ],
        },
      ]),
    );
    await search('follows');

    const preview = element.querySelector('.ng-doc-command-palette-preview')!;

    expect(preview.querySelector('h2')?.textContent?.trim()).toBe('NgDocThemeService');
    expect(preview.querySelector('ng-doc-kind-icon')?.getAttribute('data-ng-doc-kind')).toBe(
      'Injectable',
    );
    expect(preview.querySelector('.ng-doc-command-palette-signature')?.textContent).toBe(
      '@Injectable()\nexport class NgDocThemeService',
    );
    expect(preview.textContent).toContain('Service for managing themes.');
  });

  it('previews the API list description of a symbol that no search record matched', async () => {
    engine.result = () => of([]);
    await create('', API_ROUTES, () =>
      http.expectOne('assets/ng-doc/api-list.json').flush([
        {
          title: '@ng-doc/app',
          items: [
            {
              route: '/docs/api/classes/app/NgDocSidebarService',
              type: 'Injectable',
              name: 'NgDocSidebarService',
              description: 'Keeps the state of the sidebar.',
            },
          ],
        },
      ]),
    );
    await search('NgDocSidebar');

    const preview = element.querySelector('.ng-doc-command-palette-preview')!;

    expect(preview.textContent).toContain('Keeps the state of the sidebar.');
    expect(preview.querySelector('.ng-doc-command-palette-signature')).toBeNull();
  });

  it('requests exactly the API lists of the generated context, and none for a site without one', async () => {
    const context = (apiLists: string[]): Provider => ({
      provide: NG_DOC_CONTEXT,
      useValue: { navigation: [], apiLists },
    });

    await create(
      '',
      API_ROUTES,
      () => http.expectOne('assets/ng-doc/reference/api-list.json').flush(API_LIST),
      [context(['reference'])],
    );
    http.expectNone('assets/ng-doc/api-list.json');
    TestBed.resetTestingModule();

    await create('', API_ROUTES, () => undefined, [context([])]);
    http.expectNone(() => true);
  });

  it('reads the list segment of a lazy API entry from its route data', async () => {
    const routes: Routes = [
      {
        path: 'docs',
        children: [
          {
            path: 'reference',
            loadChildren: () => Promise.resolve([]),
            data: { ngDocApiListSegment: 'reference' },
          },
        ],
      },
    ];

    await create('', routes, () =>
      http.expectOne('assets/ng-doc/reference/api-list.json').flush(API_LIST),
    );
    http.expectNone('assets/ng-doc/api-list.json');
  });

  it('makes the selected scope tab one tab stop and moves it with the arrow keys', async () => {
    await create();
    await search('theme');

    expect(tabs().map((tab) => tab.getAttribute('tabindex'))).toEqual(['0', '-1', '-1', '-1']);
    expect(press(input(), 'Tab').defaultPrevented).toBe(false);

    tabs()[0].focus();
    press(tabs()[0], 'ArrowRight');
    await settle(fixture);

    expect(document.activeElement).toBe(tabs()[1]);
    expect(tabs().map((tab) => tab.getAttribute('aria-selected'))).toEqual([
      'false',
      'true',
      'false',
      'false',
    ]);
    expect(tabs().map((tab) => tab.getAttribute('tabindex'))).toEqual(['-1', '0', '-1', '-1']);
    expect(sections()).toEqual(['Guides']);

    press(tabs()[1], 'ArrowLeft');
    press(document.activeElement!, 'ArrowLeft');
    await settle(fixture);

    expect(tabs()[3].getAttribute('aria-selected')).toBe('true');
    expect(sections()).toEqual(['Actions']);

    press(document.activeElement!, 'Home');
    await settle(fixture);

    expect(document.activeElement).toBe(tabs()[0]);
  });

  it('keeps Tab inside the palette and reaches the shortcuts switch', async () => {
    await create();

    switchButton().focus();
    const forward = press(switchButton(), 'Tab');

    expect(forward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(input());

    const backward = press(input(), 'Tab', { shiftKey: true });

    expect(backward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(switchButton());
  });

  it('announces the scope, the result count, no results and failures in one status region', async () => {
    const status = () => element.querySelectorAll('[role="status"]');

    await create();

    expect(status()).toHaveLength(1);
    expect(status()[0].textContent?.trim()).toBe('All scope.');

    await search('theme');

    expect(status()[0].textContent?.trim()).toBe('All scope: 4 results.');

    tabs()[2].click();
    await settle(fixture);

    expect(status()[0].textContent?.trim()).toBe('API scope: 2 results.');

    engine.result = () => of([]);
    await search('zzz');

    expect(status()[0].textContent?.trim()).toBe('API scope: no results for “zzz”.');
  });

  it('ignores keys that compose text in an input method editor', async () => {
    await create();
    await search('theme');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

    const composing = press(input(), 'Enter', { isComposing: true });
    const processing = press(input(), 'ArrowDown', { keyCode: 229 } as KeyboardEventInit);
    await settle(fixture);

    expect(composing.defaultPrevented).toBe(false);
    expect(processing.defaultPrevented).toBe(false);
    expect(selected()).toBe(options()[0]);
    expect(navigate).not.toHaveBeenCalled();
    expect(overlayRef.close).not.toHaveBeenCalled();
  });

  it('selects a scope by click and keeps the focus in the search field', async () => {
    await create();
    await search('theme');

    tabs()[2].click();
    await settle(fixture);

    expect(sections()).toEqual(['API']);
    expect(document.activeElement).toBe(input());
    expect(tabs()[2].getAttribute('tabindex')).toBe('0');
  });

  it('loads the list of every routed API entry, from its segment, and skips a missing one quietly', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const routes: Routes = [
      {
        path: 'docs',
        children: [
          ...apiRoutes('reference', ['classes/public/WidgetApi']),
          ...apiRoutes('api', ['functions/core/asArray']),
          ...apiRoutes('missing', ['variables/extra/GONE']),
        ],
      },
    ];

    try {
      await create('', routes, async () => {
        http.expectOne('assets/ng-doc/reference/api-list.json').flush([
          {
            title: 'public',
            items: [
              {
                route: '/docs/reference/classes/public/WidgetApi',
                type: 'Class',
                name: 'WidgetApi',
              },
            ],
          },
        ]);
        http
          .expectOne('assets/ng-doc/api-list.json')
          .flush(null, { status: 404, statusText: 'Not Found' });
        http
          .expectOne('assets/ng-doc/missing/api-list.json')
          .flush(null, { status: 404, statusText: 'Not Found' });
        await Promise.resolve();
        await Promise.resolve();
        http.expectOne('assets/ng-doc/api/api-list.json').flush([
          {
            title: '@ng-doc/core',
            items: [
              { route: '/docs/api/functions/core/asArray', type: 'Function', name: 'asArray' },
            ],
          },
        ]);
      });

      engine.result = () => of([]);
      await search('a');

      const kinds = options()
        .filter((option) => option.dataset['ngDocType'] === 'api')
        .map((option) => [
          option.querySelector('.ng-doc-command-palette-label')?.textContent?.trim(),
          option.querySelector('ng-doc-kind-icon')?.getAttribute('data-ng-doc-kind'),
        ]);

      expect(kinds).toEqual([
        ['asArray', 'Function'],
        ['WidgetApi', 'Class'],
      ]);
      expect(error).not.toHaveBeenCalled();
    } finally {
      error.mockRestore();
    }
  });

  it('loads the root API list when the API pages are lazy routes', async () => {
    const routes: Routes = [
      {
        path: 'docs',
        loadChildren: () => Promise.resolve(API_ROUTES[0].children ?? []),
      },
    ];

    await create('', routes);

    engine.result = () =>
      of([
        hit({
          pageType: 'api',
          title: 'NgDocThemeService',
          route: 'docs/api/classes/app/NgDocThemeService',
        }),
      ]);
    await search('theme');

    const kinds = options()
      .filter((option) => option.dataset['ngDocType'] === 'api')
      .map((option) => [
        option.querySelector('.ng-doc-command-palette-label')?.textContent?.trim(),
        option.querySelector('ng-doc-kind-icon')?.textContent,
      ]);

    expect(kinds).toContainEqual(['NgDocThemeService', 'Injectable']);
  });

  it('opens the selected result with Enter and closes', async () => {
    await create();
    await search('theme');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

    await moveDown(options().indexOf(apiOptions()[1]));
    press(input(), 'Enter');
    await settle(fixture);

    expect(overlayRef.close).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/docs/api/classes/app/NgDocThemeService');
  });

  it('opens a guide section at its anchor on click', async () => {
    await create();
    await search('theme');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const section = options().find((option) => option.textContent?.includes('Dark mode'))!;

    // The row names its destination, so tests and tools can check where a click leads.
    expect(section.getAttribute('data-ng-doc-url')).toBe('/docs/customization/themes#dark-mode');
    section.click();

    expect(navigate).toHaveBeenCalledWith('/docs/customization/themes#dark-mode');
  });

  it('turns single-key shortcuts off from the switch and hides their hints', async () => {
    await create();
    const shortcuts = TestBed.inject(NgDocShortcutsService);

    expect(switchButton().getAttribute('aria-checked')).toBe('true');
    expect(element.querySelector('.ng-doc-command-palette-footer')?.textContent).toContain(
      'also opens search',
    );

    switchButton().click();
    await settle(fixture);

    expect(shortcuts.enabled()).toBe(false);
    expect(storage.getItem(NG_DOC_STORE_SHORTCUTS_KEY)).toBe('0');
    expect(switchButton().getAttribute('aria-checked')).toBe('false');
    expect(element.querySelector('.ng-doc-command-palette-footer')?.textContent).not.toContain(
      'also opens search',
    );
    expect(element.querySelector('.ng-doc-command-palette-row kbd')).toBeNull();
  });

  it('runs the shortcuts action and stays open', async () => {
    engine.result = () => of([]);
    await create();
    await search('shortcuts');

    expect(selected()?.textContent).toContain('Turn off single-key shortcuts');

    press(input(), 'Enter');
    await settle(fixture);

    expect(overlayRef.close).not.toHaveBeenCalled();
    expect(TestBed.inject(NgDocShortcutsService).enabled()).toBe(false);
    expect(selected()?.textContent).toContain('Turn on single-key shortcuts');
  });

  it('runs an action through its shortcut and closes', async () => {
    engine.result = () => of([]);
    await create();
    const run = vi.spyOn(TestBed.inject(NgDocShortcutsService), 'run');

    await search('dark');
    press(input(), 'Enter');

    expect(overlayRef.close).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith('t');
  });

  it('starts with the query it was opened with', async () => {
    await create('sidebar');
    await settle(fixture, 150);

    expect(input().value).toBe('sidebar');
    expect(engine.queries).toEqual(['sidebar']);
    expect(apiOptions()[0].textContent).toContain('NgDocSidebarService');
  });

  it('says when nothing matches and when the search fails', async () => {
    engine.result = () => of([]);
    await create();
    await search('zzz');

    expect(options()).toEqual([]);
    expect(element.querySelector('.ng-doc-command-palette-empty')?.textContent?.trim()).toBe(
      'No results for “zzz”',
    );

    engine.result = () => of(HITS);
    await search('theme');
    engine.result = () => throwError(() => new Error('offline'));
    await search('yyy');

    expect(options()).toEqual([]);
    expect(element.querySelector('[role="status"]')?.textContent?.trim()).toBe('Search failed.');

    expect(element.querySelector('.ng-doc-command-palette-empty')?.textContent?.trim()).toBe(
      'Search failed. Try again.',
    );
  });
});

@Component({
  template: `
    <button type="button" class="opener">Opener</button>
    <ng-doc-search />
  `,
  imports: [NgDocSearchComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class SearchHostComponent {}

// jsdom implements no Web Animations; the overlay container awaits `animate().finished`.
const animate = vi.fn(() => ({ finished: Promise.resolve() }) as unknown as Animation);

describeChangeDetection('NgDocSearchComponent', ({ providers }) => {
  let fixture: ComponentFixture<SearchHostComponent>;
  let http: HttpTestingController;

  const palette = () => document.querySelector('ng-doc-command-palette');

  beforeAll(() => {
    Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: animate });
  });

  afterAll(() => {
    delete (Element.prototype as Partial<Element>).animate;
  });

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        providers,
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: NgDocSearchEngine, useValue: new FakeSearchEngine() },
        { provide: WA_LOCAL_STORAGE, useValue: new MemoryStorage() },
        { provide: NgDocThemeService, useValue: { theme: signal(null), set: vi.fn() } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(SearchHostComponent);
    await settle(fixture);
  });

  /** Opens state changes and answers the API list request of an opened palette. */
  async function flush(): Promise<void> {
    TestBed.tick();
    http.match(() => true).forEach((request) => request.flush([]));
    await settle(fixture);
  }

  afterEach(async () => {
    press(document.body, 'Escape', { code: 'Escape' });
    await flush();
  });

  it('labels the search field with the chord that opens it', () => {
    const field = fixture.nativeElement.querySelector('.ng-doc-search-field') as HTMLElement;

    expect(field.getAttribute('aria-haspopup')).toBe('dialog');
    expect(field.getAttribute('aria-keyshortcuts')).toBe('Meta+K Control+K');
    expect(field.querySelector('kbd')?.textContent).toMatch(/⌘K|Ctrl K/);
  });

  it('opens the palette on click and returns the focus to the opener on Escape', async () => {
    const field = fixture.nativeElement.querySelector('.ng-doc-search-field') as HTMLElement;

    field.focus();
    field.click();
    await flush();

    expect(palette()).not.toBeNull();
    expect(document.activeElement?.getAttribute('role')).toBe('combobox');

    press(document.activeElement!, 'Escape', { code: 'Escape' });
    await flush();

    expect(palette()).toBeNull();
    expect(document.activeElement).toBe(field);
  });

  it('opens with Control+K and the slash key, once, and closes with the chord', async () => {
    const opener = fixture.nativeElement.querySelector('.opener') as HTMLElement;

    opener.focus();
    press(opener, 'k', { ctrlKey: true });
    await flush();

    expect(palette()).not.toBeNull();
    expect(document.activeElement?.getAttribute('role')).toBe('combobox');
    press(document.activeElement!, 'k', { ctrlKey: true });
    await flush();

    expect(palette()).toBeNull();
    expect(document.activeElement).toBe(opener);

    press(opener, '/');
    press(opener, '/');
    await flush();

    expect(document.querySelectorAll('ng-doc-command-palette')).toHaveLength(1);
  });

  it('does not open with the slash key while single-key shortcuts are off', async () => {
    TestBed.inject(NgDocShortcutsService).setEnabled(false);

    press(document.body, '/');
    await flush();

    expect(palette()).toBeNull();
  });
});
