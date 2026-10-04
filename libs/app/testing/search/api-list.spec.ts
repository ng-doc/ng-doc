import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router, RouterOutlet } from '@angular/router';
import { NgDocApiListComponent } from '@ng-doc/app/components/api-list';
import { NgDocShortcutsService } from '@ng-doc/app/services/shortcuts';
import { NgDocThemeService } from '@ng-doc/app/services/theme';
import type { NgDocApiList } from '@ng-doc/core/interfaces';
import { WA_LOCAL_STORAGE } from '@ng-web-apis/common';
import { afterEach, expect, it, vi } from 'vitest';

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
    title: '@ng-doc/core',
    items: [
      { route: '/docs/api/functions/core/asArray', type: 'Function', name: 'asArray' },
      {
        route: '/docs/api/type-aliases/core/NgDocPageType',
        type: 'TypeAlias',
        name: 'NgDocPageType',
      },
    ],
  },
  {
    title: '@ng-doc/app',
    items: [
      {
        route: '/docs/api/classes/app/NgDocThemeService',
        type: 'Injectable',
        name: 'NgDocThemeService',
      },
      {
        route: '/docs/api/classes/app/NgDocTocComponent',
        type: 'Component',
        name: 'NgDocTocComponent',
      },
      {
        route: '/docs/api/classes/app/NgDocCodeComponent',
        type: 'Component',
        name: 'NgDocCodeComponent',
      },
      {
        route: '/docs/api/functions/app/provideNgDocApp',
        type: 'Function',
        name: 'provideNgDocApp',
      },
    ],
  },
];

@Component({
  template: `<router-outlet />`,
  imports: [RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class OutletHostComponent {}

/**
 * Waits for the next render and a macrotask.
 * @param fixture - The fixture to settle.
 */
async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  await fixture.whenStable();
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
}

describeChangeDetection('NgDocApiListComponent', ({ providers }) => {
  let fixture: ComponentFixture<OutletHostComponent>;
  let http: HttpTestingController;
  let router: Router;
  let element: HTMLElement;

  const groups = () =>
    [...element.querySelectorAll('.ng-doc-api-list-group')].map((group) => ({
      id: group.id,
      title: group.querySelector('h2')?.textContent?.replace(/\s+/g, ' ').trim(),
      names: [...group.querySelectorAll('.ng-doc-api-list-name')].map((name) => name.textContent),
    }));
  const kindButtons = () => [
    ...element.querySelectorAll<HTMLButtonElement>('.ng-doc-api-list-kinds button'),
  ];
  const filter = () => element.querySelector<HTMLInputElement>('.ng-doc-api-list-filter input')!;

  /**
   * Opens the index at a URL and answers its API list request.
   * @param url - The URL to open.
   * @param list - The API list data.
   */
  async function open(url: string, list: unknown = API_LIST): Promise<void> {
    TestBed.configureTestingModule({
      providers: [
        providers,
        provideRouter([{ path: 'api', component: NgDocApiListComponent }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: WA_LOCAL_STORAGE, useValue: new MemoryStorage() },
        { provide: NgDocThemeService, useValue: { theme: signal(null), set: vi.fn() } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(OutletHostComponent);
    element = fixture.nativeElement;
    await router.navigateByUrl(url);
    // The list request is a pending task, so stability waits for it: answer it first.
    TestBed.tick();
    http.expectOne('assets/ng-doc/api-list.json').flush(list as NgDocApiList[]);
    await settle(fixture);
  }

  /**
   * Types into the filter field.
   * @param value - The text.
   */
  async function type(value: string): Promise<void> {
    filter().value = value;
    filter().dispatchEvent(new Event('input', { bubbles: true }));
    await settle(fixture);
  }

  afterEach(() => http.verify());

  it('groups declarations by kind in alphabetical order of the kind, names sorted', async () => {
    await open('/api');

    expect(element.querySelector('.ng-doc-api-list-lead')?.textContent?.trim()).toBe(
      '6 declarations in 2 scopes.',
    );
    expect(groups().map(({ id, names }) => ({ id, names }))).toEqual([
      { id: 'kind-component', names: ['NgDocCodeComponent', 'NgDocTocComponent'] },
      { id: 'kind-function', names: ['asArray', 'provideNgDocApp'] },
      { id: 'kind-injectable', names: ['NgDocThemeService'] },
      { id: 'kind-typealias', names: ['NgDocPageType'] },
    ]);
    // Group titles use the kind chips' own words.
    expect(
      [...element.querySelectorAll('.ng-doc-api-list-group h2 ng-doc-kind-icon')].map(
        (chip) => chip.textContent,
      ),
    ).toEqual(['Component', 'Function', 'Injectable', 'Type alias']);
    expect(element.querySelector('.ng-doc-api-list-scope')?.textContent).toBe('@ng-doc/app');
    expect(element.querySelector('a')?.getAttribute('href')).toBe(
      '/docs/api/classes/app/NgDocCodeComponent',
    );
  });

  it('shows the kind filter with words and counts, and filters by kind', async () => {
    await open('/api');

    expect(kindButtons().map((button) => button.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      'All 6',
      'Component 2',
      'Function 2',
      'Injectable 1',
      'Type alias 1',
    ]);
    expect(kindButtons()[0].getAttribute('aria-pressed')).toBe('true');

    kindButtons()[2].click();
    await settle(fixture);

    expect(kindButtons()[2].getAttribute('aria-pressed')).toBe('true');
    expect(kindButtons()[0].getAttribute('aria-pressed')).toBe('false');
    expect(groups().map(({ id }) => id)).toEqual(['kind-function']);
    expect(router.url).toBe('/api?type=Function');
  });

  it('groups by scope, with the kind of each declaration, and keeps it in the URL', async () => {
    await open('/api');

    element.querySelectorAll<HTMLButtonElement>('.ng-doc-api-list-segments button')[1].click();
    await settle(fixture);

    expect(groups().map(({ title, names }) => ({ title, names }))).toEqual([
      {
        title: '@ng-doc/app 4',
        names: ['NgDocCodeComponent', 'NgDocTocComponent', 'provideNgDocApp', 'NgDocThemeService'],
      },
      { title: '@ng-doc/core 2', names: ['asArray', 'NgDocPageType'] },
    ]);
    expect(
      [...element.querySelectorAll('ng-doc-kind-icon.ng-doc-api-list-scope')].map(
        (chip) => chip.textContent,
      ),
    ).toEqual(['Component', 'Component', 'Function', 'Injectable', 'Function', 'Type alias']);
    expect(router.url).toBe('/api?group=scope');
  });

  it('filters by name and keeps the filter in the URL', async () => {
    await open('/api');

    await type('theme');

    expect(groups().map(({ names }) => names)).toEqual([['NgDocThemeService']]);
    expect(router.url).toBe('/api?filter=theme');

    await type('zzz');

    expect(groups()).toEqual([]);
    expect(element.querySelector('.ng-doc-api-list-empty')?.textContent?.trim()).toBe(
      'No declarations match.',
    );
  });

  it('restores the filter, kind, scope and grouping from the URL', async () => {
    await open('/api?filter=ng&type=Component&scope=%40ng-doc%2Fapp&group=scope');

    expect(filter().value).toBe('ng');
    expect(groups().map(({ title, names }) => ({ title, names }))).toEqual([
      { title: '@ng-doc/app 2', names: ['NgDocCodeComponent', 'NgDocTocComponent'] },
    ]);
    expect(element.querySelector('.ng-doc-api-list-scope-note')?.textContent).toContain(
      '@ng-doc/app',
    );

    element.querySelector<HTMLButtonElement>('.ng-doc-api-list-scope-note button')!.click();
    await settle(fixture);

    expect(router.url).toBe('/api?filter=ng&type=Component&group=scope');
  });

  it('follows a new URL without navigating again', async () => {
    await open('/api');
    const navigate = vi.spyOn(router, 'navigate');

    await router.navigateByUrl('/api?type=Injectable');
    await settle(fixture);

    expect(groups().map(({ names }) => names)).toEqual([['NgDocThemeService']]);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('hides the description column until the list carries descriptions', async () => {
    await open('/api');

    expect(element.querySelector('.ng-doc-api-list-description')).toBeNull();
    expect(filter().placeholder).toBe('Filter by name');
  });

  it('shows and filters by descriptions when the list has them', async () => {
    const described = JSON.parse(JSON.stringify(API_LIST)) as Array<{
      title: string;
      items: Array<Record<string, string>>;
    }>;

    described[1].items[0]['description'] = 'Service for managing themes.';
    await open('/api', described);

    expect(filter().placeholder).toBe('Filter by name or description');
    expect(element.querySelectorAll('.ng-doc-api-list-none').length).toBe(5);

    await type('managing');

    expect(groups().map(({ names }) => names)).toEqual([['NgDocThemeService']]);
    expect(element.querySelector('.ng-doc-api-list-description')?.textContent?.trim()).toBe(
      'Service for managing themes.',
    );
  });

  it('focuses the filter with F while single-key shortcuts are on', async () => {
    await open('/api');

    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'f', bubbles: true, cancelable: true }),
    );

    expect(document.activeElement).toBe(filter());
    expect(filter().getAttribute('aria-keyshortcuts')).toBe('F');
    expect(element.querySelector('.ng-doc-api-list-kbd')).not.toBeNull();

    TestBed.inject(NgDocShortcutsService).setEnabled(false);
    await settle(fixture);

    expect(filter().getAttribute('aria-keyshortcuts')).toBeNull();
    expect(element.querySelector('.ng-doc-api-list-kbd')).toBeNull();
  });

  it('gives F back when the index is destroyed', async () => {
    await open('/api');
    const run = TestBed.inject(NgDocShortcutsService).run('f');

    fixture.destroy();

    expect(run).toBe(true);
    expect(TestBed.inject(NgDocShortcutsService).run('f')).toBe(false);
  });
});
