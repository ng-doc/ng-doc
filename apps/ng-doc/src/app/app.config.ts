import { provideHttpClient, withFetch, withInterceptorsFromDi } from '@angular/common/http';
import { ApplicationConfig } from '@angular/core';
import { provideClientHydration } from '@angular/platform-browser';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideRouter, withInMemoryScrolling, withViewTransitions } from '@angular/router';
import {
	NG_DOC_DEFAULT_PAGE_PROCESSORS,
	NG_DOC_DEFAULT_PAGE_SKELETON,
	NgDocDefaultSearchEngine,
	provideMainPageProcessor,
	provideNgDocApp,
	providePageSkeleton,
	provideSearchEngine,
} from '@ng-doc/app';
import { provideNgDocContext } from '@ng-doc/generated';

export const appConfig: ApplicationConfig = {
	providers: [
		provideNgDocContext(),
		provideNgDocApp({ defaultThemeId: 'auto' }),
		provideSearchEngine(NgDocDefaultSearchEngine),
		providePageSkeleton(NG_DOC_DEFAULT_PAGE_SKELETON),
		provideMainPageProcessor(NG_DOC_DEFAULT_PAGE_PROCESSORS),
		provideAnimations(),
		provideHttpClient(withInterceptorsFromDi(), withFetch()),
		provideRouter(
			[
				{
					path: 'docs',
					loadChildren: () => import('./pages/docs/docs.routes'),
				},
				{
					path: '',
					loadChildren: () => import('./pages/landing/landing.routes'),
					pathMatch: 'full',
					data: { hideSidebar: true },
				},
				{
					path: '**',
					redirectTo: 'docs/getting-started/installation',
					pathMatch: 'full',
				},
			],
			withInMemoryScrolling({
				scrollPositionRestoration: 'enabled',
				anchorScrolling: 'enabled',
			}),
		),
		provideClientHydration(),
	],
};
