import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NgDocCodeHighlighterDirective } from '@ng-doc/app/directives/code-highlighter';
import * as services from '@ng-doc/app/services';
import { NgDocContentState } from '@ng-doc/app/services/content-state';
import { NgDocHighlighterService } from '@ng-doc/app/services/highlighter';
import { NgDocStoreService } from '@ng-doc/app/services/store';
import { NgDocThemeService } from '@ng-doc/app/services/theme';
import { NG_DOC_SHIKI_THEME } from '@ng-doc/app/tokens';
import { WA_LOCAL_STORAGE } from '@ng-web-apis/common';
import { createHighlighterCore } from 'shiki/core';
import {
  type Mock,
  type MockedFunction,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { describeChangeDetection } from '../change-detection/change-detection-modes';

vi.mock('shiki/core', () => ({ createHighlighterCore: vi.fn() }));
vi.mock('shiki/wasm', () => ({ default: vi.fn() }));
vi.mock('shiki/engine/oniguruma', () => ({ createOnigurumaEngine: vi.fn() }));
// The theme modules declare `name`: a spec below reads it on every theme, and Vitest refuses reads
// of exports a mock does not declare.
vi.mock('shiki/themes/github-light.mjs', () => ({ default: {}, name: undefined }));
vi.mock('shiki/themes/ayu-dark.mjs', () => ({ default: {}, name: undefined }));
vi.mock('shiki/langs/angular-html.mjs', () => ({ default: [] }));

const createHighlighter = createHighlighterCore as MockedFunction<typeof createHighlighterCore>;

class MemoryStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((onResolve) => (resolve = onResolve));
  return { promise, resolve };
}

function fakeHighlighter(): {
  codeToHtml: Mock<(code: string) => string>;
  dispose: Mock<() => void>;
} {
  return {
    codeToHtml: vi.fn((code: string) => `<pre class="shiki">${code}</pre>`),
    dispose: vi.fn(),
  };
}

@Component({
  selector: 'ng-doc-theme-reader',
  template: `<span>{{ themeService.theme() ?? 'light' }}</span>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class ThemeReaderComponent {
  protected readonly themeService = inject(NgDocThemeService);
}

@Component({
  selector: 'ng-doc-code-reader',
  imports: [NgDocCodeHighlighterDirective],
  template: `<div [ngDocHighlighter]="'<b>code</b>'"></div>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class CodeReaderComponent {}

describeChangeDetection('NgDocThemeService', ({ providers }) => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
    document.documentElement.setAttribute('data-theme', 'auto');
    TestBed.configureTestingModule({
      providers: [...providers, { provide: WA_LOCAL_STORAGE, useValue: storage }],
    });
  });

  afterEach(() => document.documentElement.removeAttribute('data-theme'));

  it('starts from the document attribute and follows set() in the signal and the Observable', () => {
    const service = TestBed.inject(NgDocThemeService);
    const changes: Array<string | null> = [];
    service.themeChanges().subscribe((theme) => changes.push(theme));

    expect(service.theme()).toBe('auto');
    expect(service.currentTheme).toBe('auto');

    service.set('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(service.theme()).toBe('dark');
    expect(service.currentTheme).toBe('dark');
    expect(storage.values.get('ng-doc-theme-id')).toBe('dark');

    service.set();
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(service.theme()).toBeNull();
    expect(service.currentTheme).toBeNull();
    expect(storage.values.get('ng-doc-theme-id')).toBe('');

    service.set('dark');
    service.set('');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(service.theme()).toBeNull();
    expect(storage.values.get('ng-doc-theme-id')).toBe('');
    expect(changes).toEqual(['dark', null, 'dark', null]);
  });

  it('reads the injected document', () => {
    const element = document.createElement('html');
    element.setAttribute('data-theme', 'custom');
    TestBed.overrideProvider(DOCUMENT, { useValue: { documentElement: element } });

    expect(TestBed.inject(NgDocThemeService).currentTheme).toBe('custom');
    expect(TestBed.inject(NgDocThemeService).theme()).toBe('custom');
  });

  it('renders a theme change in an OnPush view without a manual change detection', async () => {
    const fixture = TestBed.createComponent(ThemeReaderComponent);
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toBe('auto');

    TestBed.inject(NgDocThemeService).set('dark');
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toBe('dark');
  });
});

describe('@ng-doc/app/services', () => {
  it('re-exports the theme service, which `@ng-doc/app` exports with every other service', () => {
    // Read by name: before the theme service was re-exported, the barrel had no such member.
    expect((services as Record<string, unknown>)['NgDocThemeService']).toBe(NgDocThemeService);
    expect((services as Record<string, unknown>)['NgDocHighlighterService']).toBe(
      NgDocHighlighterService,
    );
  });
});

describe('NgDocStoreService', () => {
  it('stores strings and serialized values', () => {
    const storage = new MemoryStorage();
    TestBed.configureTestingModule({
      providers: [{ provide: WA_LOCAL_STORAGE, useValue: storage }],
    });
    const store = TestBed.inject(NgDocStoreService);

    store.set('plain', 'value');
    store.set('list', [1, 2], (value: number[]) => JSON.stringify(value));

    expect(store.get('plain')).toBe('value');
    expect(store.get('missing')).toBeNull();
    expect(store.get('list', (value: string | null) => JSON.parse(value ?? '[]'))).toEqual([1, 2]);
  });
});

describe('NgDocContentState', () => {
  it('exposes the current failure as a signal', () => {
    const state = new NgDocContentState();
    const first = {};
    const second = {};
    const firstFailure = { contentId: 'first', error: new Error('first') };
    const secondFailure = { contentId: 'second', error: new Error('second') };

    expect(state.failure()).toBeUndefined();
    state.report(first, firstFailure);
    state.report(second, secondFailure);
    expect(state.failure()).toBe(firstFailure);
    state.clear(first);
    expect(state.failure()).toBe(secondFailure);
    expect(() => state.throwIfFailed()).toThrow('second');
    state.clear(first);
    state.clear(second);
    expect(state.failure()).toBeUndefined();
    expect(state.currentFailure()).toBeUndefined();
  });
});

describeChangeDetection('NgDocHighlighterService', ({ providers }) => {
  beforeEach(() => {
    Reflect.deleteProperty(NgDocHighlighterService, 'defaultInitialization');
    createHighlighter.mockReset();
    TestBed.configureTestingModule({
      providers: [...providers, { provide: NG_DOC_SHIKI_THEME, useValue: { light: '', dark: '' } }],
    });
  });

  it('is ready once initialized and not after it is destroyed', async () => {
    const highlighter = fakeHighlighter();
    createHighlighter.mockResolvedValue(highlighter as never);
    const service = TestBed.inject(NgDocHighlighterService);

    expect(service.ready()).toBe(false);
    expect(service.highlight('<i></i>')).toBe('');
    await service.initialize();
    expect(service.ready()).toBe(true);
    expect(service.highlight('<i></i>')).toBe('<pre class="shiki"><i></i></pre>');

    TestBed.resetTestingModule();
    expect(service.ready()).toBe(false);
    expect(service.highlight('<i></i>')).toBe('');
  });

  it('highlights code rendered before Shiki has loaded once it loads', async () => {
    const pending = deferred<ReturnType<typeof fakeHighlighter>>();
    createHighlighter.mockReturnValue(pending.promise as never);
    const service = TestBed.inject(NgDocHighlighterService);
    const initialized = service.initialize();
    const fixture = TestBed.createComponent(CodeReaderComponent);
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('div').innerHTML).toBe('');

    pending.resolve(fakeHighlighter());
    await initialized;
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('div').innerHTML).toBe(
      '<pre class="shiki"><b>code</b></pre>',
    );
  });

  it('loads the css-variables theme and falls back to the github pair without theme names', async () => {
    const highlighter = fakeHighlighter();
    createHighlighter.mockResolvedValue(highlighter as never);
    const service = TestBed.inject(NgDocHighlighterService);
    await service.initialize();
    service.highlight('<i></i>');

    const themes = (await Promise.all(
      createHighlighter.mock.calls[0][0]!.themes as unknown[],
    )) as Array<{ name?: string; colors?: Record<string, string> }>;
    const syntax = themes.find((theme) => theme?.name === 'css-variables');
    expect(syntax?.colors?.['editor.foreground']).toBe('var(--ng-doc-syntax-plain)');
    expect(highlighter.codeToHtml).toHaveBeenCalledWith('<i></i>', {
      lang: 'angular-html',
      themes: { light: 'github-light', dark: 'ayu-dark' },
    });
  });
});

describeChangeDetection('NgDocHighlighterService with configured themes', ({ providers }) => {
  beforeEach(() => {
    Reflect.deleteProperty(NgDocHighlighterService, 'defaultInitialization');
    createHighlighter.mockReset();
    TestBed.configureTestingModule({
      providers: [
        ...providers,
        {
          provide: NG_DOC_SHIKI_THEME,
          useValue: { light: 'css-variables', dark: 'css-variables' },
        },
      ],
    });
  });

  it('highlights with the theme names of the generated context', async () => {
    const highlighter = fakeHighlighter();
    createHighlighter.mockResolvedValue(highlighter as never);
    const service = TestBed.inject(NgDocHighlighterService);
    await service.initialize();
    service.highlight('<i></i>');

    expect(highlighter.codeToHtml).toHaveBeenCalledWith('<i></i>', {
      lang: 'angular-html',
      themes: { light: 'css-variables', dark: 'css-variables' },
    });
  });

  it('ignores the deprecated theme option and reports it in development mode', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const highlighter = fakeHighlighter();
      createHighlighter.mockResolvedValue(highlighter as never);
      const service = TestBed.inject(NgDocHighlighterService);
      await service.initialize({ theme: { light: 'github-dark', dark: 'github-dark' } });
      service.highlight('<i></i>');

      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toContain('`shiki.theme` of `provideNgDocApp` has no effect');
      expect(highlighter.codeToHtml).toHaveBeenCalledWith('<i></i>', {
        lang: 'angular-html',
        themes: { light: 'css-variables', dark: 'css-variables' },
      });
    } finally {
      warn.mockRestore();
    }
  });

  it('reports nothing without the deprecated theme option', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      createHighlighter.mockResolvedValue(fakeHighlighter() as never);
      await TestBed.inject(NgDocHighlighterService).initialize({ themes: [] });

      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});
