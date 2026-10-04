import { isPlatformBrowser } from '@angular/common';
import {
  afterNextRender,
  computed,
  DestroyRef,
  DOCUMENT,
  inject,
  Injector,
  NgZone,
  PLATFORM_ID,
  Service,
  Signal,
  signal,
  untracked,
} from '@angular/core';
import { NgDocStoreService } from '@ng-doc/app/services/store';
import { NgDocThemeService } from '@ng-doc/app/services/theme';

import { NG_DOC_SHORTCUTS, NG_DOC_STORE_SHORTCUTS_KEY, NgDocShortcut } from './shortcut';

/**
 * Elements where a single key types text or drives the widget instead of running a shortcut:
 * fields, widgets with their own key handling or typeahead, and demos and playgrounds, which
 * host the reader's components.
 */
const OWN_KEYS = [
  'input',
  'textarea',
  'select',
  '[contenteditable]:not([contenteditable="false"])',
  ...[
    'combobox',
    'listbox',
    'menu',
    'menubar',
    'grid',
    'tree',
    'treegrid',
    'slider',
    'spinbutton',
    'application',
  ].map((role: string) => `[role="${role}"]`),
  'ng-doc-demo',
  'ng-doc-demo-pane',
  'ng-doc-playground',
].join(', ');

/**
 * Keyboard shortcuts of the documentation.
 *
 * Single-key shortcuts (slash opens the search, the square brackets open the previous and next
 * page, F focuses the filter of the page, L copies the link to the page and T switches between
 * the light and the dark theme) are on by default. Readers turn them all off with one switch, and
 * the choice is saved in the browser. A site turns them off by default with the shortcuts option
 * of provideNgDocApp. They never run while the reader types in a field or holds Command, Control
 * or Alt. Chords such as Command+K (Control+K) always work.
 */
@Service()
export class NgDocShortcutsService {
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  private readonly ngZone = inject(NgZone);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly appDefault = inject(NG_DOC_SHORTCUTS);
  private readonly userChoice = signal<boolean | undefined>(undefined);
  private readonly shortcuts: NgDocShortcut[] = [];
  // The theme T switched away from, and the theme it set, so a second T restores the first.
  private themeToggle?: { previous: string | null; set: string | null };

  /**
   * Whether single-key shortcuts are on: the reader's saved choice, or the site's default.
   * Components hide the hints of single-key shortcuts while it is false.
   */
  readonly enabled: Signal<boolean> = computed(() => this.userChoice() ?? this.appDefault);

  constructor() {
    this.registerDefaults();

    if (!this.browser) {
      return;
    }

    // The saved choice is read after the first render, so a hydrated page first renders exactly
    // what the server rendered (the site's default) and then switches.
    afterNextRender(() => this.userChoice.set(this.readChoice()), { injector: this.injector });

    const listener = (event: KeyboardEvent) => this.onKeydown(event);
    // One document listener for every shortcut; change detection runs only when one matches.
    this.ngZone.runOutsideAngular(() => this.document.addEventListener('keydown', listener));
    inject(DestroyRef).onDestroy(() => this.document.removeEventListener('keydown', listener));
  }

  /**
   * Turns single-key shortcuts on or off for this reader and saves the choice in the browser.
   * @param enabled - Whether single-key shortcuts should run.
   */
  setEnabled(enabled: boolean): void {
    this.userChoice.set(enabled);

    if (this.browser) {
      try {
        this.injector.get(NgDocStoreService).set(NG_DOC_STORE_SHORTCUTS_KEY, enabled ? '1' : '0');
      } catch {
        // Storage can be unavailable (private mode, blocked cookies); the choice lasts the visit.
      }
    }
  }

  /** Turns single-key shortcuts off when they are on, and on when they are off. */
  toggle(): void {
    this.setEnabled(!untracked(this.enabled));
  }

  /**
   * Registers a shortcut. When several shortcuts use the same key, the one registered last runs,
   * so a page can take over a key while it is shown and give it back when it is destroyed.
   * @param shortcut - The shortcut to register.
   * @returns A function that removes the shortcut.
   */
  register(shortcut: NgDocShortcut): () => void {
    this.shortcuts.push(shortcut);

    return () => {
      const index = this.shortcuts.lastIndexOf(shortcut);

      if (index !== -1) {
        this.shortcuts.splice(index, 1);
      }
    };
  }

  /**
   * Runs the single-key shortcut registered for a key, as if the reader pressed it, even while
   * single-key shortcuts are off. The search palette uses it for its actions.
   * @param key - The key of the shortcut, for example 't'.
   * @returns Whether a shortcut is registered for the key.
   */
  run(key: string): boolean {
    const shortcut = this.find(key.toLowerCase(), false);

    untracked(() => shortcut?.handler());

    return !!shortcut;
  }

  private onKeydown(event: KeyboardEvent): void {
    if (event.defaultPrevented || event.isComposing || event.repeat || !event.key) {
      return;
    }

    // AltGr (Control+Alt on Windows) types characters such as [ and ] on many layouts: those
    // keys are plain characters, not chords.
    const altGraph = !!event.getModifierState?.('AltGraph');
    const chord = !altGraph && (event.metaKey || event.ctrlKey) && !event.altKey;
    const shortcut = this.find(event.key.toLowerCase(), chord);

    if (!shortcut || (!chord && !this.acceptsSingleKey(event, altGraph))) {
      return;
    }

    event.preventDefault();
    this.ngZone.run(() => untracked(() => shortcut.handler(event)));
  }

  private find(key: string, chord: boolean): NgDocShortcut | undefined {
    for (let index = this.shortcuts.length - 1; index >= 0; index--) {
      const shortcut = this.shortcuts[index];

      if (shortcut.key.toLowerCase() === key && !!shortcut.chord === chord) {
        return shortcut;
      }
    }

    return undefined;
  }

  private acceptsSingleKey(event: KeyboardEvent, altGraph: boolean): boolean {
    if (
      !untracked(this.enabled) ||
      event.metaKey ||
      (!altGraph && (event.ctrlKey || event.altKey))
    ) {
      return false;
    }

    const target = event.composedPath?.()[0] ?? event.target;

    return !(target instanceof Element && target.closest(OWN_KEYS));
  }

  private readChoice(): boolean | undefined {
    try {
      const saved = this.injector.get(NgDocStoreService).get(NG_DOC_STORE_SHORTCUTS_KEY);

      return saved === '1' ? true : saved === '0' ? false : undefined;
    } catch {
      return undefined;
    }
  }

  private registerDefaults(): void {
    this.register({ key: 't', handler: () => this.toggleDarkTheme() });
    this.register({ key: 'l', handler: () => this.copyLink() });
    // Pager links: rel="prev"/"next" is the standard marker; the classes are the NgDoc pager's.
    this.register({ key: '[', handler: () => this.click('a[rel~="prev"], a.ng-doc-prev-page') });
    this.register({ key: ']', handler: () => this.click('a[rel~="next"], a.ng-doc-next-page') });
  }

  private toggleDarkTheme(): void {
    const themeService = this.injector.get(NgDocThemeService);
    const theme = themeService.theme();
    const toggle = this.themeToggle;

    // A second T restores the theme the first one replaced (auto or a custom theme), unless the
    // reader changed the theme in between.
    if (toggle && toggle.set === theme) {
      this.themeToggle = undefined;
      themeService.set(toggle.previous ?? undefined);

      return;
    }

    const dark =
      theme === 'dark' ||
      (theme === 'auto' &&
        !!this.document.defaultView?.matchMedia?.('(prefers-color-scheme: dark)').matches);
    const next = dark ? null : 'dark';

    this.themeToggle = { previous: theme, set: next };
    themeService.set(next ?? undefined);
  }

  private copyLink(): void {
    void this.document.defaultView?.navigator.clipboard
      ?.writeText(this.document.location.href)
      .catch(() => undefined);
  }

  private click(selector: string): void {
    this.document.querySelector<HTMLElement>(selector)?.click();
  }
}
