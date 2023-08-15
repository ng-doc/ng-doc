import {APP_INITIALIZER, Optional, Provider} from '@angular/core';
import {
	NG_DOC_DARK_PURPLE_THEME,
	NG_DOC_NIGHT_THEME,
	NG_DOC_STORE_THEME_KEY,
} from '@ng-doc/app/constants';
import {isDarkOsTheme} from '@ng-doc/app/helpers';
import {NgDocApplicationConfig, NgDocTheme} from '@ng-doc/app/interfaces';
import {NG_DOC_DEFAULT_PAGE_PROCESSORS} from '@ng-doc/app/processors';
import {NgDocStoreService, NgDocThemeService} from '@ng-doc/app/services';
import {NG_DOC_DEFAULT_THEME_ID, NG_DOC_THEME} from '@ng-doc/app/tokens';
import {asArray} from '@ng-doc/core';

/**
 *
 * @param config
 */
export function provideNgDocAppConfig(config?: NgDocApplicationConfig): Provider[] {
	return [
		{provide: NG_DOC_THEME, useValue: NG_DOC_NIGHT_THEME, multi: true},
		{provide: NG_DOC_THEME, useValue: NG_DOC_DARK_PURPLE_THEME, multi: true},
		...asArray(config?.themes).map((theme: NgDocTheme) => ({
			provide: NG_DOC_THEME,
			useValue: theme,
			multi: true,
		})),
		...asArray(config?.defaultThemeId).map((themeId: string) => ({
			provide: NG_DOC_DEFAULT_THEME_ID,
			useValue: themeId,
		})),
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
		...NG_DOC_DEFAULT_PAGE_PROCESSORS,
	];
}
