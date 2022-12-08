import {OverlayModule} from '@angular/cdk/overlay';
import {HttpClientModule} from '@angular/common/http';
import {APP_INITIALIZER, ModuleWithProviders, NgModule, Optional} from '@angular/core';
import {NgDocSearchEngine} from '@ng-doc/app/classes/search-engine';
import {NgDocRootModule} from '@ng-doc/app/components/root';
import {NG_DOC_NIGHT_THEME, NG_DOC_STORE_THEME_KEY} from '@ng-doc/app/constants';
import {NgDocStoreService, NgDocThemeService} from '@ng-doc/app/services';
import {NG_DOC_DEFAULT_THEME_ID, NG_DOC_THEME} from '@ng-doc/app/tokens';
import {NgDocApplicationConfig, NgDocTheme} from '@ng-doc/app/interfaces';
import {asArray} from '@ng-doc/core';

@NgModule({
	imports: [
		HttpClientModule,
		OverlayModule,
	],
	exports: [NgDocRootModule],
})
export class NgDocModule {
	static forRoot(config?: NgDocApplicationConfig): ModuleWithProviders<NgDocModule> {
		return {
			ngModule: NgDocModule,
			providers: [
				{provide: NgDocSearchEngine, useValue: new NgDocSearchEngine()},
				{provide: NG_DOC_THEME, useValue: NG_DOC_NIGHT_THEME, multi: true},
				...asArray(config?.themes)
					.map((theme: NgDocTheme) => ({
						provide: NG_DOC_THEME,
						useValue: theme,
						multi: true,
					})),
				...asArray(config?.defaultThemeId)
					.map((themeId: string) => ({
						provide: NG_DOC_DEFAULT_THEME_ID,
						useValue: themeId,
					})),
				{
					provide: APP_INITIALIZER,
					useFactory: (themeService: NgDocThemeService, store: NgDocStoreService, defaultThemeId: string) => {
						return () => {
							const themeId: string | null = store.get(NG_DOC_STORE_THEME_KEY);

							return themeService.set(themeId ?? defaultThemeId);
						};
					},
					multi: true,
					deps: [NgDocThemeService, NgDocStoreService, [new Optional(), NG_DOC_DEFAULT_THEME_ID]],
				},
			],
		};
	}
}
