import {OverlayModule} from '@angular/cdk/overlay';
import {HttpClientModule} from '@angular/common/http';
import {APP_INITIALIZER, ModuleWithProviders, NgModule, Optional} from '@angular/core';
import {NgDocSearchEngine} from '@ng-doc/app/classes';
import {NgDocNavbarModule, NgDocSidebarModule} from '@ng-doc/app/components';
import {NgDocRootModule} from '@ng-doc/app/components/root';
import {NG_DOC_NIGHT_THEME, NG_DOC_STORE_THEME_KEY} from '@ng-doc/app/constants';
import {NgDocStoreService, NgDocThemeService} from '@ng-doc/app/services';
import {NG_DOC_DEFAULT_THEME_ID, NG_DOC_THEME} from '@ng-doc/app/tokens';
import {
	NgDocBooleanControlModule,
	NgDocNumberControlModule,
	NgDocStringControlModule,
	NgDocTypeAliasControlModule,
} from '@ng-doc/app/type-controls';

@NgModule({
	imports: [
		HttpClientModule,
		OverlayModule,
		/* Type controls */
		NgDocStringControlModule,
		NgDocNumberControlModule,
		NgDocBooleanControlModule,
		NgDocTypeAliasControlModule,
	],
	exports: [NgDocRootModule, NgDocNavbarModule, NgDocSidebarModule],
})
export class NgDocModule {
	static forRoot(): ModuleWithProviders<NgDocModule> {
		return {
			ngModule: NgDocModule,
			providers: [
				{provide: NgDocSearchEngine, useValue: new NgDocSearchEngine()},
				{provide: NG_DOC_THEME, useValue: NG_DOC_NIGHT_THEME, multi: true},
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
