import { Clipboard } from '@angular/cdk/clipboard';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import {
  ApplicationRef,
  ChangeDetectionStrategy,
  Component,
  input,
  provideZonelessChangeDetection,
  signal,
  viewChild,
  ViewContainerRef,
} from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter, Router, RouterOutlet, Routes } from '@angular/router';
import { NgDocRootPage } from '@ng-doc/app/classes/root-page';
import { NgDocSearchEngine } from '@ng-doc/app/classes/search-engine';
import { NgDocDemoDisplayerComponent } from '@ng-doc/app/components/demo-displayer';
import { NgDocNavbarComponent } from '@ng-doc/app/components/navbar';
import { NgDocPageComponent } from '@ng-doc/app/components/page';
import { NgDocPageWrapperComponent } from '@ng-doc/app/components/page-wrapper';
import { NgDocBasePlayground } from '@ng-doc/app/components/playground';
import { NgDocRootComponent } from '@ng-doc/app/components/root';
import { NgDocSidebarComponent } from '@ng-doc/app/components/sidebar';
import { NG_DOC_DEFAULT_PAGE_PROCESSORS, NG_DOC_DEFAULT_PAGE_SKELETON } from '@ng-doc/app/defaults';
import { NgDocDemoAssets, NgDocNavigation, NgDocSearchResult } from '@ng-doc/app/interfaces';
import { providePageSkeleton } from '@ng-doc/app/providers/page-skeleton';
import { providePlaygroundDemo } from '@ng-doc/app/providers/playground-demo';
import { NgDocHighlighterService } from '@ng-doc/app/services/highlighter';
import { NG_DOC_CONTEXT, provideMainPageProcessor } from '@ng-doc/app/tokens';
import type { NgDocPage } from '@ng-doc/core/interfaces';
import { NgDocPageType } from '@ng-doc/core/types';
import { WA_LOCAL_STORAGE } from '@ng-web-apis/common';
import { Observable, of } from 'rxjs';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * A zoneless smoke host: one docs route rendered the way a generated site renders it (the root,
 * the header with search, the sidebar, a page wrapper and a page whose content has a heading, a
 * code block, a demo and a playground), and the search palette opened from the header.
 *
 * The application is zoneless and the spec never calls `detectChanges()`: every update must be
 * scheduled by NgDoc itself (signals, `markForCheck`, `setInput`), as in an Angular 21+
 * application. `nx run app:test-zoneless` runs it without zone.js loaded at all.
 */

// The playground formats its code view with esthetic; the formatting itself is not what this
// host checks. The mock answers after a timer, like the real
// formatter's lazy load, so the stability check below cannot pass by timing alone.
vi.mock('esthetic', () => ({
  __esModule: true,
  default: {
    html: (html: string) => new Promise((resolve) => setTimeout(() => resolve(html), 30)),
  },
}));

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

@Component({
  selector: 'ng-doc-smoke-tag',
  template: `<span class="smoke-tag">{{ label() }}</span>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class SmokeTagComponent {
  readonly label = input<string>('Tag');
}

@Component({
  selector: 'ng-doc-smoke-demo',
  template: `<button type="button" class="smoke-demo" (click)="count.set(count() + 1)">
    Clicked {{ count() }}
  </button>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class SmokeDemoComponent {
  readonly count = signal(0);
}

const PAGE: NgDocPage = {
  title: 'Smoke',
  mdFile: '',
  demos: { SmokeDemoComponent },
  playgrounds: {
    SmokeTag: { target: SmokeTagComponent, template: '<ng-doc-selector></ng-doc-selector>' },
  },
};

/** The playground class the builder generates for the SmokeTag playground. */
@Component({
  selector: 'ng-doc-playground-1',
  template: `<ng-doc-smoke-tag [label]="properties()['label']"></ng-doc-smoke-tag>`,
  imports: [SmokeTagComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class PlaygroundComponent1 extends NgDocBasePlayground {
  static override readonly selector: string = 'ng-doc-smoke-tag';

  readonly target = SmokeTagComponent;

  readonly playground = viewChild(SmokeTagComponent);

  readonly viewContainerRef = viewChild(SmokeTagComponent, { read: ViewContainerRef });

  readonly configData: Record<string, unknown> = {};
}

/**
 * Highlighted code as the builder emits it.
 * @param text - Escaped code.
 */
function highlighted(text: string): string {
  return `<pre class="shiki"><code class="language-typescript"><span class="line">${text}</span></code></pre>`;
}

const PLAYGROUND_DATA = JSON.stringify({
  label: { type: 'string', inputName: 'label', default: "'Tag'" },
}).replace(/"/g, '&quot;');

const CONTENT = `
  <dl class="ng-doc-api-details" data-ng-doc-variant="rail" data-ng-doc-rail-details hidden>
    <dt>Scope</dt><dd>smoke</dd>
  </dl>
  <h2 id="usage" headingLink="true" href="/docs/smoke#usage">Usage</h2>
  <p>Some text.</p>
  <pre name="usage.ts"><code class="language-typescript"><span class="line">const answer = 42;</span></code></pre>
  <ng-doc-demo componentName="SmokeDemoComponent" indexable="false"><div id="options">{}</div></ng-doc-demo>
  <h2 id="playground" headingLink="true" href="/docs/smoke#playground">Playground</h2>
  <ng-doc-playground id="SmokeTag" indexable="false">
    <div id="selectors">ng-doc-smoke-tag</div>
    <div id="pipeName"></div>
    <div id="data">${PLAYGROUND_DATA}</div>
    <div id="options">{}</div>
  </ng-doc-playground>
`;

/** The page class the builder generates for a guide. */
@Component({
  selector: 'ng-doc-page-smoke',
  template: `<ng-doc-page></ng-doc-page>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgDocPageComponent, PlaygroundComponent1],
  providers: [
    { provide: NgDocRootPage, useExisting: SmokePageComponent },
    providePlaygroundDemo('SmokeTag', PlaygroundComponent1),
  ],
})
class SmokePageComponent extends NgDocRootPage {
  readonly pageType: NgDocPageType = 'guide';
  readonly pageContent: string = CONTENT;
  readonly editSourceFileUrl: string = 'https://example.com/edit/smoke.md';
  readonly viewSourceFileUrl?: string = undefined;
  override readonly page: NgDocPage = PAGE;
  override readonly demoAssets: NgDocDemoAssets = {
    SmokeDemoComponent: [{ title: 'TypeScript', code: highlighted('export class Demo {}') }],
  };
}

const PAGE_ROUTES: Routes = [{ path: '', component: SmokePageComponent, title: 'Smoke' }];

/** The page wrapper the builder generates around a page. */
@Component({
  selector: 'ng-doc-page-wrapper-smoke',
  template: `<ng-doc-page-wrapper
    [routes]="routes"
    headerContent="<h1>Smoke</h1>"
    [hasBreadcrumb]="true"
    pageType="guide"></ng-doc-page-wrapper>`,
  imports: [NgDocPageWrapperComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class SmokeWrapperComponent {
  readonly routes: Routes = PAGE_ROUTES;
}

@Component({
  selector: 'ng-doc-smoke-app',
  template: `
    <ng-doc-root>
      <ng-doc-navbar>
        <a ngDocNavbarLeft href="/">Brand</a>
      </ng-doc-navbar>
      <ng-doc-sidebar></ng-doc-sidebar>
      <router-outlet></router-outlet>
    </ng-doc-root>
  `,
  imports: [NgDocRootComponent, NgDocNavbarComponent, NgDocSidebarComponent, RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class SmokeAppComponent {}

const NAVIGATION: NgDocNavigation[] = [
  {
    title: 'Guides',
    route: '/docs',
    expandable: true,
    expanded: true,
    children: [
      { title: 'Smoke', route: '/docs/smoke' },
      { title: 'Other', route: '/docs/other' },
    ],
  },
];

class FakeSearchEngine extends NgDocSearchEngine {
  search(): Observable<NgDocSearchResult[]> {
    return of([
      {
        index: {
          breadcrumbs: ['Guides', 'Smoke'],
          title: 'Smoke',
          section: 'Usage',
          fragment: 'usage',
          pageType: 'guide',
          route: 'docs/smoke',
          content: 'Some text.',
        },
        positions: {},
      },
    ]);
  }
}

describe('NgDoc zoneless smoke host', () => {
  let fixture: ComponentFixture<SmokeAppComponent>;
  let http: HttpTestingController;
  let element: HTMLElement;
  const copy = vi.fn();

  beforeAll(() => {
    // jsdom implements no Web Animations; overlays and the expander await `animate().finished`.
    Object.defineProperty(Element.prototype, 'animate', {
      configurable: true,
      value: () =>
        ({ finished: Promise.resolve(), cancel: () => undefined }) as unknown as Animation,
    });
  });

  afterAll(() => {
    delete (Element.prototype as Partial<Element>).animate;
  });

  /**
   * Answers the pending requests (icons, API lists), then waits until the application is stable
   * and its timers have run, a few times: every answer can start new work.
   */
  async function settle(): Promise<void> {
    for (let round = 0; round < 4; round++) {
      http
        .match(() => true)
        .forEach((request) =>
          request.cancelled
            ? undefined
            : request.flush(request.request.url.endsWith('.svg') ? '<svg></svg>' : []),
        );
      await fixture.whenStable();
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }

  beforeEach(async () => {
    copy.mockReset();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([
          {
            path: 'docs',
            children: [
              { path: 'smoke', component: SmokeWrapperComponent, children: PAGE_ROUTES },
              { path: 'other', children: [] },
            ],
          },
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
        providePageSkeleton(NG_DOC_DEFAULT_PAGE_SKELETON),
        provideMainPageProcessor(NG_DOC_DEFAULT_PAGE_PROCESSORS),
        { provide: NG_DOC_CONTEXT, useValue: { navigation: NAVIGATION } },
        { provide: NgDocSearchEngine, useValue: new FakeSearchEngine() },
        { provide: NgDocHighlighterService, useValue: { highlight: (code: string) => code } },
        { provide: WA_LOCAL_STORAGE, useValue: new MemoryStorage() },
        { provide: Clipboard, useValue: { copy } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(SmokeAppComponent);
    element = fixture.nativeElement;
    await TestBed.inject(Router).navigateByUrl('/docs/smoke');
    await settle();
  });

  afterEach(async () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await settle();
    fixture.destroy();
  });

  it('renders the docs page: chrome, header, content, code, TOC and pager', () => {
    expect(element.querySelector('.ng-doc-skip-link')).not.toBeNull();
    expect(element.querySelector('ng-doc-search')).not.toBeNull();
    expect(element.querySelector('ng-doc-sidebar')?.textContent).toContain('Smoke');
    expect(element.querySelector('ng-doc-page-header, .ng-doc-page-header')?.textContent).toContain(
      'Smoke',
    );
    expect(element.querySelector('ng-doc-code')?.textContent).toContain('const answer = 42;');

    const toc: string[] = Array.from(
      element.querySelectorAll('ng-doc-toc li[ng-doc-toc-element]'),
      (item) => item.textContent?.trim() ?? '',
    );

    expect(toc).toEqual(['Usage', 'Playground']);
  });

  it('moves the symbol details of the page into the rail', () => {
    const details = element.querySelector('ng-doc-toc .ng-doc-toc-details dl');

    expect(details?.hasAttribute('hidden')).toBe(false);
    expect(details?.textContent).toContain('smoke');
    expect(element.querySelector('.ng-doc-page-wrapper [data-ng-doc-rail-details]')).toBeNull();
  });

  it('renders a demo and updates it on a click', async () => {
    const demo = element.querySelector<HTMLButtonElement>('button.smoke-demo');

    expect(demo?.textContent?.trim()).toBe('Clicked 0');

    demo?.click();
    await settle();

    expect(demo?.textContent?.trim()).toBe('Clicked 1');
  });

  it('renders a playground and follows a property change', async () => {
    const tag = () => element.querySelector('ng-doc-playground .smoke-tag');

    expect(tag()?.textContent).toBe('Tag');

    const field = element.querySelector<HTMLInputElement>(
      'ng-doc-playground ng-doc-string-control input',
    );

    expect(field).not.toBeNull();
    // The default of the target's signal input, read through the playground's viewChild().
    expect(field!.value).toBe('Tag');

    field!.value = 'Zoneless';
    field!.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();

    expect(tag()?.textContent).toBe('Zoneless');
  });

  it('keeps the application unstable until the playground code view is formatted', async () => {
    const field = element.querySelector<HTMLInputElement>(
      'ng-doc-playground ng-doc-string-control input',
    );
    const code = (): string =>
      fixture.debugElement
        .query(By.css('ng-doc-playground ng-doc-demo-displayer'))
        .injector.get(NgDocDemoDisplayerComponent)
        .code();

    field!.value = 'Formatted';
    field!.dispatchEvent(new Event('input', { bubbles: true }));
    // Server rendering serializes the page once the application is stable, so the code view must
    // be filled by then.
    await TestBed.inject(ApplicationRef).whenStable();

    expect(code()).toContain("'Formatted'");
  });

  it('opens the search palette with Control+K and shows the results of a query', async () => {
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true }),
    );
    await settle();

    const palette = document.querySelector('ng-doc-command-palette');
    const query = palette?.querySelector<HTMLInputElement>('input[role="combobox"]');

    expect(query).not.toBeNull();
    expect(document.activeElement).toBe(query);

    query!.value = 'smoke';
    query!.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
    await new Promise((resolve) => setTimeout(resolve, 400));
    await settle();

    const rows = Array.from(
      document.querySelectorAll('.ng-doc-command-palette-row[role="option"]'),
      (row) => row.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    );

    expect(rows.some((row) => row.includes('Usage'))).toBe(true);
  });
});
