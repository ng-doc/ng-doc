import { DOCUMENT } from '@angular/common';
import { Inject, Injectable } from '@angular/core';
import { NG_DOC_STORE_THEME_KEY } from '@ng-doc/app/constants';
import { NgDocTheme } from '@ng-doc/app/interfaces';
import { NgDocStoreService } from '@ng-doc/app/services/store';
import { NG_DOC_THEME } from '@ng-doc/app/tokens';
import { WINDOW } from '@ng-web-apis/common';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { fromEvent, Observable, Subject } from 'rxjs';

/**
 * Service for managing themes.
 */
@Injectable({
	providedIn: 'root',
})
@UntilDestroy()
export class NgDocThemeService {
	static readonly autoThemeId: string = 'ng-doc-auto';

	private linkElement?: HTMLLinkElement;
	private theme: NgDocTheme | undefined = undefined;
	private readonly theme$: Subject<NgDocTheme | undefined> = new Subject<NgDocTheme | undefined>();
	private autoTheme: [NgDocTheme | undefined, NgDocTheme | undefined] | undefined = undefined;

	constructor(
		@Inject(WINDOW)
		private readonly window: Window,
		@Inject(DOCUMENT)
		private readonly document: Document,
		@Inject(NG_DOC_THEME)
		private readonly themes: NgDocTheme[],
		private readonly store: NgDocStoreService,
	) {
		fromEvent<MediaQueryList>(this.window.matchMedia('(prefers-color-scheme: dark)'), 'change')
			.pipe(untilDestroyed(this))
			.subscribe(() => this.setAutoTheme());
	}

	/**
	 * Returns the current theme.
	 */
	get currentTheme(): NgDocTheme | undefined {
		return this.theme;
	}

	/**
	 * Returns whether automatic theme switching based on the user's operating system settings is enabled.
	 */
	get isAutoThemeEnabled(): boolean {
		return this.autoTheme !== undefined;
	}

	/**
	 * Enables automatic theme switching based on the user's operating system settings.
	 *
	 * @param light - Theme for light mode.
	 * @param dark - Theme for dark mode.
	 */
	async enableAutoTheme(
		light: NgDocTheme | undefined,
		dark: NgDocTheme | undefined,
	): Promise<void> {
		this.autoTheme = [light, dark];

		return this.setAutoTheme();
	}

	/**
	 * Disables automatic theme switching based on the user's operating system settings.
	 */
	async disableAutoTheme(): Promise<void> {
		this.autoTheme = undefined;

		return this.set(this.store.get(NG_DOC_STORE_THEME_KEY) ?? undefined);
	}

	/**
	 * Sets the theme by id.
	 *
	 * @param id - Theme id.
	 * @param save - Whether to save the theme in the store to restore it when the page is reloaded. (`true` by default)
	 */
	async set(id?: string, save: boolean = true): Promise<void> {
		this.removeLink();

		if (save) {
			this.autoTheme = undefined;
		}

		if (id) {
			const theme: NgDocTheme | undefined = this.themes.find(
				(theme: NgDocTheme) => theme.id === id,
			);

			if (!theme) {
				console.warn(
					`Theme with id "${id}" is not registered. Make sure that you registered it in the root of your application.`,
				);

				return;
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
		save && this.store.set(NG_DOC_STORE_THEME_KEY, 'ng-doc-day');

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

	private async setAutoTheme(): Promise<void> {
		if (this.autoTheme !== undefined) {
			const isDark: boolean = this.window.matchMedia('(prefers-color-scheme: dark)').matches;
			const [light, dark] = this.autoTheme;
			this.store.set(NG_DOC_STORE_THEME_KEY, NgDocThemeService.autoThemeId);

			return this.set(isDark ? dark?.id : light?.id, false);
		}
	}
}
