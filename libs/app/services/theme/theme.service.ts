import {DOCUMENT} from '@angular/common';
import {Inject, Injectable} from '@angular/core';
import {NG_DOC_STORE_THEME_KEY} from '@ng-doc/app/constants';
import {NgDocTheme} from '@ng-doc/app/interfaces';
import {NgDocStoreService} from '@ng-doc/app/services/store';
import {NG_DOC_THEME} from '@ng-doc/app/tokens';
import {Observable, Subject} from 'rxjs';

@Injectable({
	providedIn: 'root',
})
export class NgDocThemeService {
	private linkElement?: HTMLLinkElement;
	private theme: NgDocTheme | undefined = undefined;
	private readonly theme$: Subject<NgDocTheme | undefined> = new Subject<NgDocTheme | undefined>();

	constructor(
		@Inject(DOCUMENT)
		private readonly document: Document,
		@Inject(NG_DOC_THEME)
		private readonly themes: NgDocTheme[],
		private readonly store: NgDocStoreService,
	) {}

	get currentTheme(): NgDocTheme | undefined {
		return this.theme;
	}

	set(id?: string): Promise<void> {
		this.removeLink();

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
				this.store.set(NG_DOC_STORE_THEME_KEY, theme.id);
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
		this.store.set(NG_DOC_STORE_THEME_KEY, 'day');
		this.theme$.next(undefined);

		return Promise.resolve();
	}

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
