import { ViewportScroller } from '@angular/common';
import { APP_INITIALIZER, Optional, Provider } from '@angular/core';
import { NgDocSearchEngine } from '@ng-doc/app/classes';
import {
	NG_DOC_DARK_PURPLE_THEME,
	NG_DOC_NIGHT_THEME,
	NG_DOC_STORE_THEME_KEY,
} from '@ng-doc/app/constants';
import { isDarkOsTheme } from '@ng-doc/app/helpers';
import { NgDocPageProcessor, NgDocPageSkeleton, NgDocTheme } from '@ng-doc/app/interfaces';
import { NgDocStoreService, NgDocThemeService } from '@ng-doc/app/services';
import {
	NG_DOC_DEFAULT_THEME_ID,
	NG_DOC_PAGE_PROCESSOR,
	NG_DOC_PAGE_SKELETON,
	NG_DOC_THEME,
} from '@ng-doc/app/tokens';
import { asArray, Constructor } from '@ng-doc/core';
import { NgDocUiConfig, provideNgDocUiKitConfig } from '@ng-doc/ui-kit';

/**
 * NgDoc search engine configuration.
 */
export interface NgDocSearchEngineConfig<E extends Constructor<NgDocSearchEngine>> {
	/**
	 * Search engine class.
	 */
	engine: E;
	/**
	 * Parameters for the search engine class.
	 * First argument of the constructor of the search engine class.
	 */
	options?: ConstructorParameters<E>[0];
}

/**
 * NgDoc application config.
 */
export interface NgDocApplicationConfig<E extends Constructor<NgDocSearchEngine>> {
	/**
	 * Search engine configuration.
	 * You can create and provide your own `NgDocSearchEngine` if you want to handle the search yourself,
	 * or you can use the default search engine `NgDocDefaultSearchEngine`.
	 */
	searchEngine: NgDocSearchEngineConfig<E>;

	/**
	 * Page skeleton that should be used to create different parts of the page.
	 */
	skeleton?: NgDocPageSkeleton;

	/**
	 * List of page processors that will be registered in the application and will be used to process
	 * the page (e.g. replace html nodes with an Angular component).
	 */
	pageProcessors?: Array<NgDocPageProcessor<unknown>>;

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
 * Provides
 *
 * @param config -
 */
export function provideNgDocApp<E extends Constructor<NgDocSearchEngine>>(
	config: NgDocApplicationConfig<E>,
): Provider[] {
	return [
		/* --- Themes --- */
		{ provide: NG_DOC_THEME, useValue: NG_DOC_NIGHT_THEME, multi: true },
		{ provide: NG_DOC_THEME, useValue: NG_DOC_DARK_PURPLE_THEME, multi: true },
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

		/* --- Page Processors --- */
		...asArray(config.pageProcessors).map((processor: NgDocPageProcessor) => ({
			provide: NG_DOC_PAGE_PROCESSOR,
			useValue: processor,
			multi: true,
		})),

		/* --- UiKit --- */
		...provideNgDocUiKitConfig(config?.uiKit),

		/* --- Search Engine --- */
		{
			provide: NgDocSearchEngine,
			useValue: new config.searchEngine.engine(config.searchEngine.options),
		},

		/* --- Skeleton --- */
		{
			provide: NG_DOC_PAGE_SKELETON,
			useValue: config.skeleton ?? {},
		},
	];
}
