import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import {
  ChangeDetectionStrategy,
  Component,
  createEnvironmentInjector,
  EnvironmentInjector,
  Provider,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NgDocBreadcrumbComponent } from '@ng-doc/app/components/breadcrumb';
import { NgDocCopyButtonComponent } from '@ng-doc/app/components/copy-button';
import { NgDocRootComponent } from '@ng-doc/app/components/root';
import { NgDocThemeToggleComponent } from '@ng-doc/app/components/theme-toggle';
import { NgDocTexts } from '@ng-doc/app/interfaces';
import { provideNgDocTexts } from '@ng-doc/app/providers/texts';
import { mergeNgDocTexts, NG_DOC_DEFAULT_TEXTS, NG_DOC_TEXTS } from '@ng-doc/app/tokens';
import { NgDocBlockquoteComponent } from '@ng-doc/ui-kit/components/blockquote';
import { NG_DOC_UI_KIT_DEFAULT_TEXTS, NG_DOC_UI_KIT_TEXTS } from '@ng-doc/ui-kit/texts';
import { WA_LOCAL_STORAGE } from '@ng-web-apis/common';
import { beforeEach, describe, expect, it } from 'vitest';

import { describeChangeDetection } from '../change-detection/change-detection-modes';

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
  selector: 'ng-doc-texts-host',
  imports: [
    NgDocRootComponent,
    NgDocBreadcrumbComponent,
    NgDocThemeToggleComponent,
    NgDocCopyButtonComponent,
    NgDocBlockquoteComponent,
  ],
  template: `
    <ng-doc-root>
      <ng-doc-breadcrumb [breadcrumbs]="['Guides', 'Install']" />
      <ng-doc-theme-toggle />
      <ng-doc-copy-button text="npm i @ng-doc/app"><span>Copy</span></ng-doc-copy-button>
      <blockquote ng-doc-blockquote type="note"><p>Body</p></blockquote>
    </ng-doc-root>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class TextsHostComponent {}

// A page's `providers` go to the providers of its generated page component: an element injector.
@Component({
  selector: 'ng-doc-texts-page-host',
  imports: [NgDocBreadcrumbComponent],
  template: `<ng-doc-breadcrumb [breadcrumbs]="['Guides']" />`,
  providers: [provideNgDocTexts({ navigation: { breadcrumbs: 'Pfad' } })],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class TextsPageHostComponent {}

/** The texts the host shows to readers. */
interface ShownTexts {
  skipLink: string;
  breadcrumbs: string | null;
  theme: string | null;
  copy: string | null;
  callout: string;
}

describeChangeDetection('provideNgDocTexts', ({ providers }) => {
  /**
   * Renders the host with the given providers.
   * @param extra - Providers added to the testing module, such as `provideNgDocTexts(...)`.
   * @returns The rendered markup and the texts it shows.
   */
  async function render(extra: Provider[] = []): Promise<{ html: string; shown: ShownTexts }> {
    TestBed.configureTestingModule({
      providers: [
        ...providers,
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: WA_LOCAL_STORAGE, useValue: new MemoryStorage() },
        ...extra,
      ],
    });

    const fixture = TestBed.createComponent(TextsHostComponent);

    fixture.detectChanges();
    await fixture.whenStable();

    const host: HTMLElement = fixture.nativeElement;
    const text = (selector: string): string =>
      host.querySelector(selector)?.textContent?.trim() ?? '';
    const label = (selector: string): string | null =>
      host.querySelector(selector)?.getAttribute('aria-label') ?? null;

    return {
      html: host.innerHTML,
      shown: {
        skipLink: text('.ng-doc-skip-link'),
        breadcrumbs: label('ng-doc-breadcrumb nav'),
        theme: label('ng-doc-theme-toggle button'),
        copy: label('ng-doc-copy-button button'),
        callout: text('.ng-doc-blockquote-title'),
      },
    };
  }

  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme');
  });

  it('shows the English texts without the provider', async () => {
    const { shown } = await render();

    expect(shown).toEqual({
      skipLink: 'Skip to content',
      breadcrumbs: 'Breadcrumb',
      theme: 'Light theme. Switch to dark',
      copy: 'Copy to clipboard',
      callout: 'Note',
    });
  });

  it('renders the same markup with no changes or with the defaults', async () => {
    const { html } = await render();

    for (const texts of [{}, NG_DOC_DEFAULT_TEXTS]) {
      TestBed.resetTestingModule();

      expect((await render([provideNgDocTexts(texts)])).html).toBe(html);
    }
  });

  it('shows the changed texts, in the app and the ui-kit components', async () => {
    const { shown } = await render([
      provideNgDocTexts({
        navigation: { skipToContent: 'Zum Inhalt springen', breadcrumbs: 'Brotkrümelpfad' },
        theme: {
          light: 'Hell',
          dark: 'Dunkel',
          label: ({ current, next }) => `Design: ${current}. Wechseln zu ${next}`,
        },
        copy: { copy: 'In die Zwischenablage kopieren' },
        blockquote: { note: 'Hinweis' },
      }),
    ]);

    expect(shown).toEqual({
      skipLink: 'Zum Inhalt springen',
      breadcrumbs: 'Brotkrümelpfad',
      theme: 'Design: Hell. Wechseln zu Dunkel',
      copy: 'In die Zwischenablage kopieren',
      callout: 'Hinweis',
    });
  });
});

describe('NG_DOC_TEXTS', () => {
  it('resolves to the frozen defaults, which include the ui-kit texts', () => {
    const texts: NgDocTexts = TestBed.inject(NG_DOC_TEXTS);

    expect(texts).toBe(NG_DOC_DEFAULT_TEXTS);
    expect(TestBed.inject(NG_DOC_UI_KIT_TEXTS)).toBe(NG_DOC_UI_KIT_DEFAULT_TEXTS);
    expect(texts.blockquote).toBe(NG_DOC_UI_KIT_DEFAULT_TEXTS.blockquote);
    expect(Object.isFrozen(texts)).toBe(true);
    for (const group of Object.values(texts)) {
      expect(Object.isFrozen(group)).toBe(true);
    }
  });

  it('words the texts with values as before', () => {
    const { search, searchPalette, demo, page, content, theme, apiList } = NG_DOC_DEFAULT_TEXTS;

    expect(search.label({ shortcut: '⌘K' })).toBe('Search (⌘K)');
    expect(searchPalette.noResults({ query: 'button' })).toBe('No results for “button”');
    expect(searchPalette.statusScope({ scope: 'All' })).toBe('All scope.');
    expect(searchPalette.statusResults({ scope: 'API', count: 1 })).toBe('API scope: 1 result.');
    expect(searchPalette.statusResults({ scope: 'API', count: 3 })).toBe('API scope: 3 results.');
    expect(searchPalette.statusNoResults({ scope: 'Guides', query: 'x' })).toBe(
      'Guides scope: no results for “x”.',
    );
    expect(demo.frameTitle({ name: 'ButtonDemoComponent' })).toBe('ButtonDemoComponent demo');
    expect(page.backTo({ title: 'Buttons' })).toBe('Back to Buttons');
    expect(page.backTo({})).toBe('Back to the page');
    expect(content.openImage({ alt: 'Logo' })).toBe('Open image: Logo');
    expect(content.codeLines({ count: 1, ranges: '3' })).toBe('Line 3');
    expect(content.codeLines({ count: 3, ranges: '2, 5–6' })).toBe('Lines 2, 5–6');
    expect(theme.label({ current: 'Dark', next: 'Auto' })).toBe('Dark theme. Switch to auto');
    expect(theme.tooltip({ current: 'Light' })).toBe('Light theme');
    expect(apiList.summary({ declarations: 12, scopes: 1 })).toBe('12 declarations in 1 scope.');
    expect(apiList.summary({ declarations: 12, scopes: 3 })).toBe('12 declarations in 3 scopes.');
    expect(apiList.scopeNote({ scope: 'core' })).toBe('Showing core only.');
  });
});

describe('provideNgDocTexts merging', () => {
  it('changes only the texts it sets and keeps the others of their group', () => {
    TestBed.configureTestingModule({
      providers: [provideNgDocTexts({ search: { placeholder: 'Suche…' } })],
    });

    const texts: NgDocTexts = TestBed.inject(NG_DOC_TEXTS);

    expect(texts.search.placeholder).toBe('Suche…');
    expect(texts.search.shortcutOther).toBe('Ctrl K');
    expect(texts.toc).toBe(NG_DOC_DEFAULT_TEXTS.toc);
  });

  it('applies the calls of one injector in order, so a later call wins', () => {
    TestBed.configureTestingModule({
      providers: [
        provideNgDocTexts({ toc: { onThisPage: 'Auf dieser Seite', backToTop: 'Nach oben' } }),
        provideNgDocTexts({ toc: { onThisPage: 'Inhalt' } }),
      ],
    });

    const texts: NgDocTexts = TestBed.inject(NG_DOC_TEXTS);

    expect(texts.toc.onThisPage).toBe('Inhalt');
    expect(texts.toc.backToTop).toBe('Nach oben');
    expect(TestBed.inject(NG_DOC_UI_KIT_TEXTS)).toBe(texts);
  });

  it('applies the calls of a child injector on top of its parent', () => {
    TestBed.configureTestingModule({
      providers: [provideNgDocTexts({ toc: { onThisPage: 'Auf dieser Seite' } })],
    });

    const parent: EnvironmentInjector = TestBed.inject(EnvironmentInjector);
    const child: EnvironmentInjector = createEnvironmentInjector(
      [provideNgDocTexts({ toc: { backToTop: 'Nach oben' }, pane: { resizer: 'Anpassen' } })],
      parent,
    );

    expect(child.get(NG_DOC_TEXTS).toc.onThisPage).toBe('Auf dieser Seite');
    expect(child.get(NG_DOC_TEXTS).toc.backToTop).toBe('Nach oben');
    expect(child.get(NG_DOC_UI_KIT_TEXTS).pane.resizer).toBe('Anpassen');
    expect(parent.get(NG_DOC_TEXTS).toc.backToTop).toBe('Back to top');
    expect(parent.get(NG_DOC_UI_KIT_TEXTS).pane.resizer).toBe('Resize the panes');

    child.destroy();
  });

  it('applies the providers of a component on top of the application texts', async () => {
    TestBed.configureTestingModule({
      providers: [provideNgDocTexts({ navigation: { breadcrumbs: 'Brotkrumen', next: 'Weiter' } })],
    });

    const fixture = TestBed.createComponent(TextsPageHostComponent);

    fixture.detectChanges();
    await fixture.whenStable();

    const breadcrumb = fixture.debugElement.children[0];

    expect(breadcrumb.nativeElement.querySelector('nav').getAttribute('aria-label')).toBe('Pfad');
    expect(breadcrumb.injector.get(NG_DOC_TEXTS).navigation.next).toBe('Weiter');
    expect(TestBed.inject(NG_DOC_TEXTS).navigation.breadcrumbs).toBe('Brotkrumen');
  });

  it('keeps a text that a change sets to undefined, and changes neither input', () => {
    const change = { search: { placeholder: undefined, nothingFound: 'Nichts gefunden' } };
    const texts: NgDocTexts = mergeNgDocTexts(NG_DOC_DEFAULT_TEXTS, change);

    expect(texts.search.placeholder).toBe('Search docs…');
    expect(texts.search.nothingFound).toBe('Nichts gefunden');
    expect(NG_DOC_DEFAULT_TEXTS.search.nothingFound).toBe('Nothing was found...');
    expect(change.search.placeholder).toBeUndefined();
    expect(Object.isFrozen(texts.search)).toBe(true);
  });
});
