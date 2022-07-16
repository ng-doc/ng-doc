import {HTTP_INTERCEPTORS} from '@angular/common/http';
import {ModuleWithProviders, NgModule} from '@angular/core';
import {NgDocCacheInterceptor} from '@ng-doc/ui-kit/interceptors';
import {NgDocUiConfig} from '@ng-doc/ui-kit/interfaces';
import {NG_DOC_ASSETS_PATH} from '@ng-doc/ui-kit/tokens';

@NgModule({})
export class NgDocUiKitRootModule {
	static forRoot(config?: NgDocUiConfig): ModuleWithProviders<NgDocUiKitRootModule> {
		return {
			ngModule: NgDocUiKitRootModule,
			providers: [
				{
					provide: NG_DOC_ASSETS_PATH,
					useValue: config?.assetsPath ?? 'assets',
				},
				{
					provide: HTTP_INTERCEPTORS,
					useClass: NgDocCacheInterceptor,
					multi: true,
				},
			],
		};
	}
}
