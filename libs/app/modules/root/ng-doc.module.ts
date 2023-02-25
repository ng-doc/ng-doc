import {OverlayModule} from '@angular/cdk/overlay';
import {HttpClientModule} from '@angular/common/http';
import {APP_INITIALIZER, ModuleWithProviders, NgModule, Optional} from '@angular/core';
import {NgDocSearchEngine} from '@ng-doc/app/classes/search-engine';
import {NgDocNavbarModule} from '@ng-doc/app/components/navbar';
import {NgDocRootModule} from '@ng-doc/app/components/root';
import {NgDocSidebarModule} from '@ng-doc/app/components/sidebar';
import {NG_DOC_DARK_PURPLE_THEME, NG_DOC_NIGHT_THEME, NG_DOC_STORE_THEME_KEY} from '@ng-doc/app/constants';
import {NgDocApplicationConfig, NgDocTheme} from '@ng-doc/app/interfaces';
import {NgDocStoreService} from '@ng-doc/app/services/store';
import {NgDocThemeService} from '@ng-doc/app/services/theme';
import {NG_DOC_DEFAULT_THEME_ID, NG_DOC_THEME} from '@ng-doc/app/tokens';
import {asArray} from '@ng-doc/core/helpers/as-array';
import {NgDocUiKitRootModule} from '@ng-doc/ui-kit/modules/root';

@NgModule({
	imports: [HttpClientModule, OverlayModule, NgDocUiKitRootModule.forRoot()],
	exports: [NgDocRootModule, NgDocUiKitRootModule, NgDocNavbarModule, NgDocSidebarModule],
})
export class NgDocModule {
	static forRoot(config?: NgDocApplicationConfig): ModuleWithProviders<NgDocModule> {
		return {
			ngModule: NgDocModule,
			providers: [
				{provide: NgDocSearchEngine, useValue: new NgDocSearchEngine()},
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
