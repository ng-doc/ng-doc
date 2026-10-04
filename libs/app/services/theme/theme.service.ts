import { DOCUMENT, inject, Service, Signal, signal } from '@angular/core';
import { NG_DOC_STORE_THEME_KEY } from '@ng-doc/app/constants';
import { NgDocStoreService } from '@ng-doc/app/services/store';
import { Observable, Subject } from 'rxjs';

/**
 * Service for managing themes.
 *
 * The theme is the `data-theme` attribute of the document element: `auto`, `dark`, the id of a
 * custom theme, or no attribute for the light theme.
 */
@Service()
export class NgDocThemeService {
  protected readonly document = inject(DOCUMENT);
  protected readonly store = inject(NgDocStoreService);
  protected readonly change$ = new Subject<string | null>();
  protected readonly documentElement = this.document.documentElement;

  private readonly themeState = signal<string | null>(this.readTheme());

  /**
   * The current theme as a signal: the theme id, or `null` for the light theme.
   *
   * It starts with the document's `data-theme` attribute and follows every `set()` call.
   */
  readonly theme: Signal<string | null> = this.themeState.asReadonly();

  /**
   * Returns the current theme: the document's `data-theme` attribute, or `null` without one.
   */
  get currentTheme(): string | null {
    return this.readTheme();
  }

  /**
   * Emits the theme after every `set()` call. Read `theme` for the current value as a
   * signal.
   */
  themeChanges(): Observable<string | null> {
    return this.change$.asObservable();
  }

  /**
   * Sets the theme by id.
   * @param id - Theme id. If not provided, the theme will be removed.
   */
  set(id?: string): void {
    // An empty id removes the attribute, so it is the light theme (`null`) everywhere.
    const theme = id || null;

    theme
      ? this.documentElement.setAttribute('data-theme', theme)
      : this.documentElement.removeAttribute('data-theme');

    this.store.set(NG_DOC_STORE_THEME_KEY, theme ?? '');
    this.themeState.set(theme);
    this.change$.next(theme);
  }

  private readTheme(): string | null {
    return this.documentElement.getAttribute('data-theme');
  }
}
