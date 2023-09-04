import { ViewportScroller } from '@angular/common';
import { APP_INITIALIZER, Optional, Provider } from '@angular/core';
import { NG_DOC_NIGHT_THEME, NG_DOC_STORE_THEME_KEY } from '@ng-doc/app/constants';
import { isDarkOsTheme } from '@ng-doc/app/helpers';
import { NgDocTheme } from '@ng-doc/app/interfaces';
import { NgDocStoreService, NgDocThemeService } from '@ng-doc/app/services';
import { NG_DOC_DEFAULT_THEME_ID, NG_DOC_THEME } from '@ng-doc/app/tokens';
import { asArray } from '@ng-doc/core';
import { NgDocUiConfig, provideNgDocUiKitConfig } from '@ng-doc/ui-kit';

/**
 * NgDoc application config.
 */
export interface NgDocApplicationConfig {
	/**
	 * List of themes that will be registered in the application and can be used via `NgDocThemeService`.
	 */
	themes?: NgDocTheme[];

	/**
	 * Default theme id.
	 * You can use `auto` to automatically select the theme based on the user's operating system settings.
	 */
	defaultThemeId?: string | 'auto';

	/**
	 * UI Kit configuration.
	 */
	uiKit?: NgDocUiConfig;
}

/**
 * Provides the NgDoc application configuration.
 *
 * @param config - The optional application configuration.
 */
export function provideNgDocApp(config?: NgDocApplicationConfig): Provider[] {
	return [
		/* --- Themes --- */
		{ provide: NG_DOC_THEME, useValue: NG_DOC_NIGHT_THEME, multi: true },
		...asArray(config?.themes).map((theme: NgDocTheme) => ({
			provide: NG_DOC_THEME,
			useValue: theme,
			multi: true,
		})),
		...asArray(config?.defaultThemeId).map((themeId: string) => ({
			provide: NG_DOC_DEFAULT_THEME_ID,
			useValue: themeId,
		})),

		/* --- Theme Initializer--- */
		{
			provide: APP_INITIALIZER,
			useFactory: (
				themeService: NgDocThemeService,
				store: NgDocStoreService,
				defaultThemeId: string | 'auto',
			) => {
				return () => {
					const themeId: string | null = store.get(NG_DOC_STORE_THEME_KEY);

					if (defaultThemeId === 'auto' && !themeId) {
						return themeService.set(isDarkOsTheme() ? NG_DOC_NIGHT_THEME.id : undefined, false);
					}

					return themeService.set(themeId ?? defaultThemeId, false);
				};
			},
			multi: true,
			deps: [NgDocThemeService, NgDocStoreService, [new Optional(), NG_DOC_DEFAULT_THEME_ID]],
		},

		/* --- Viewport Scroller --- */
		{
			provide: APP_INITIALIZER,
			multi: true,
			deps: [ViewportScroller],
			useFactory: (viewportScroller: ViewportScroller) => {
				return () => viewportScroller.setOffset([0, 64]);
			},
		},

		/* --- UiKit --- */
		...provideNgDocUiKitConfig(config?.uiKit),
	];
}
