import {provideHttpClient, withInterceptorsFromDi} from '@angular/common/http';
import {enableProdMode} from '@angular/core';
import {bootstrapApplication} from '@angular/platform-browser';
import {provideAnimations} from '@angular/platform-browser/animations';
import {provideRouter, withInMemoryScrolling} from '@angular/router';
import {NgDocDefaultSearchEngine, provideNgDocAppConfig, provideSearchEngine} from '@ng-doc/app';
import {provideNgDocContext} from '@ng-doc/generated';
import {provideNgDocUiKitConfig} from '@ng-doc/ui-kit';

import {AppComponent} from './app/app.component';
import {environment} from './environments/environment';

if (environment.production) {
	enableProdMode();
}

bootstrapApplication(AppComponent, {
	providers: [
		provideNgDocContext(),
		provideNgDocAppConfig(),
		provideNgDocUiKitConfig(),
		provideSearchEngine(NgDocDefaultSearchEngine),
		provideAnimations(),
		provideHttpClient(withInterceptorsFromDi()),
		provideRouter(
			[
				{
					path: 'docs',
					loadChildren: () => import('./app/pages/docs/docs.routes'),
				},
				{
					path: '',
					loadChildren: () => import('./app/pages/landing/landing.routes'),
					pathMatch: 'full',
					data: {hideSidebar: true},
				},
				{path: '**', redirectTo: 'docs/getting-started/installation', pathMatch: 'full'},
			],
			withInMemoryScrolling({
				scrollPositionRestoration: 'enabled',
				anchorScrolling: 'enabled',
			}),
		),
	],
}).catch((err: unknown) => console.error(err));
