import {DOCUMENT} from '@angular/common';
import {Inject, Injectable, Optional} from '@angular/core';
import {NG_DOC_NIGHT_THEME, NG_DOC_STORE_THEME_KEY} from '@ng-doc/app/constants';
import {NgDocTheme} from '@ng-doc/app/interfaces';
import {NgDocStoreService} from '@ng-doc/app/services/store';
import {NG_DOC_DEFAULT_THEME_ID, NG_DOC_THEME} from '@ng-doc/app/tokens';
import {UntilDestroy, untilDestroyed} from '@ngneat/until-destroy';
import {fromEvent, Observable, Subject} from 'rxjs';
import {takeUntil} from 'rxjs/operators';

/**
 * Service for managing themes.
 */
@Injectable({
	providedIn: 'root',
})
@UntilDestroy()
export class NgDocThemeService {
	private linkElement?: HTMLLinkElement;
	private theme: NgDocTheme | undefined = undefined;
	private readonly theme$: Subject<NgDocTheme | undefined> = new Subject<NgDocTheme | undefined>();
	private readonly disableAutoTheme$: Subject<void> = new Subject<void>();

	constructor(
		@Inject(DOCUMENT)
		private readonly document: Document,
		@Inject(NG_DOC_THEME)
		private readonly themes: NgDocTheme[],
		private readonly store: NgDocStoreService,
		@Inject(NG_DOC_DEFAULT_THEME_ID)
		@Optional()
		private readonly defaultThemeId?: string | 'auto',
	) {
		if (this.defaultThemeId === 'auto') {
			fromEvent<MediaQueryList>(window.matchMedia('(prefers-color-scheme: dark)'), 'change')
				.pipe(takeUntil(this.disableAutoTheme$), untilDestroyed(this))
				.subscribe((event: MediaQueryList) => this.set(event.matches ? NG_DOC_NIGHT_THEME.id : undefined, false))
		}
	}

	/**
	 * Returns the current theme.
	 */
	get currentTheme(): NgDocTheme | undefined {
		return this.theme;
	}

	/**
	 * Sets the theme by id.
	 *
	 * @param id Theme id.
	 * @param save Whether to save the theme in the store to restore it when the page is reloaded. (`true` by default)
	 */
	set(id?: string | 'auto', save: boolean = true): Promise<void> {
		this.removeLink();

		if (id === 'auto') {
			return Promise.resolve();
		}

		save && this.disableAutoTheme$.next();

		if (id !== 'day' && id) {
			const theme: NgDocTheme | undefined = this.themes.find((theme: NgDocTheme) => theme.id === id);

			if (!theme) {
				console.warn(
					`Theme with id "${id}" is not registered. Make sure that you registered it in the root of your application.`,
				);

				return Promise.resolve();
			}

			this.createLinkIfNoExists();

			if (this.linkElement) {
				this.linkElement.href = theme.path;
				save && this.store.set(NG_DOC_STORE_THEME_KEY, theme.id);
				this.theme = theme;

				return new Promise<void>((resolve: () => void, reject: (err: Event | string) => void) => {
					if (this.linkElement) {
						this.linkElement.onload = () => {
							this.theme$.next(theme);
							resolve();
						};
						this.linkElement.onerror = reject;
					}
				});
			}
		}

		save && this.store.set(NG_DOC_STORE_THEME_KEY, 'day');

		this.theme$.next(undefined);

		return Promise.resolve();
	}

	/**
	 * Returns an observable that emits when the theme changes.
	 */
	themeChanges(): Observable<NgDocTheme | undefined> {
		return this.theme$.asObservable();
	}

	private removeLink(): void {
		this.theme = undefined;
		this.linkElement?.remove();
		this.linkElement = undefined;
	}
	private createLinkIfNoExists(): void {
		if (!this.linkElement) {
			this.linkElement = this.document.createElement('link');
			this.linkElement.setAttribute('rel', 'stylesheet');
			this.linkElement.setAttribute('type', 'text/css');
			this.document.getElementsByTagName('head')[0].appendChild(this.linkElement);
		}
	}
}
