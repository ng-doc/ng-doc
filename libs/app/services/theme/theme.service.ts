import {DOCUMENT} from '@angular/common';
import {Inject, Injectable} from '@angular/core';
import {NgDocTheme} from '@ng-doc/app/interfaces';
import {NG_DOC_THEME} from '@ng-doc/app/tokens';

@Injectable({
	providedIn: 'root',
})
export class NgDocThemeService {
	private linkElement?: HTMLLinkElement;
	private theme: NgDocTheme | undefined = undefined;

	constructor(
		@Inject(DOCUMENT)
		private readonly document: Document,
		@Inject(NG_DOC_THEME)
		private readonly themes: NgDocTheme[],
	) {
	}

	get currentTheme(): NgDocTheme | undefined {
		return this.theme;
	}

	set(id?: string): void {
		this.removeLink();

		if (id !== 'day' && id) {
			const theme: NgDocTheme | undefined = this.themes.find((theme: NgDocTheme) => theme.id === id);

			if (!theme) {
				throw new Error(`Theme with id "${id}" is not registered. Make sure that you registered it in the root of your application.`)
			}

			this.createLinkIfNoExists();

			if (this.linkElement) {
				this.linkElement.href = theme.path;
				this.theme = theme;
			}
		}
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
			this.document.getElementsByTagName("head")[0].appendChild(this.linkElement);
		}
	}
}
