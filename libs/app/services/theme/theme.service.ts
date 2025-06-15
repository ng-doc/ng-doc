import { DOCUMENT, inject, Injectable } from '@angular/core';
import { NG_DOC_STORE_THEME_KEY } from '@ng-doc/app/constants';
import { NgDocStoreService } from '@ng-doc/app/services/store';
import { Observable, Subject } from 'rxjs';

/**
 * Service for managing themes.
 */
@Injectable({ providedIn: 'root' })
export class NgDocThemeService {
  protected readonly document = inject(DOCUMENT);
  protected readonly store = inject(NgDocStoreService);
  protected readonly change$ = new Subject<string | null>();
  protected readonly documentElement = this.document.documentElement;

  /**
   * Returns the current theme.
   */
  get currentTheme(): string | null {
    return document.documentElement.getAttribute('data-theme');
  }

  themeChanges(): Observable<string | null> {
    return this.change$.asObservable();
  }

  /**
   * Sets the theme by id.
   * @param id - Theme id. If not provided, the theme will be removed.
   */
  set(id?: string): void {
    id
      ? this.documentElement.setAttribute('data-theme', id)
      : this.documentElement.removeAttribute('data-theme');

    this.store.set(NG_DOC_STORE_THEME_KEY, id ?? '');
    this.change$.next(id ?? null);
  }
}
