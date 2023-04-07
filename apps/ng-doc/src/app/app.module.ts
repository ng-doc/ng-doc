import {HttpClientModule} from '@angular/common/http';
import {NgModule} from '@angular/core';
import {BrowserModule} from '@angular/platform-browser';
import {BrowserAnimationsModule} from '@angular/platform-browser/animations';
import {RouterModule} from '@angular/router';
import {
	NgDocDefaultSearchEngine,
	NgDocModule,
	NgDocNavbarModule,
	NgDocSidebarModule,
	NgDocThemeToggleModule,
	provideSearchEngine,
} from '@ng-doc/app';
import {NgDocGeneratedModule} from '@ng-doc/generated';
import {NgDocButtonIconModule, NgDocIconModule, NgDocMediaQueryModule, NgDocTooltipModule} from '@ng-doc/ui-kit';

import {AppComponent} from './app.component';

@NgModule({
	declarations: [AppComponent],
	imports: [
		BrowserModule,
		BrowserAnimationsModule,
		HttpClientModule,
		NgDocModule.forRoot(),
		NgDocGeneratedModule.forRoot(),
		RouterModule.forRoot(
			[
				{
					path: 'docs',
					loadChildren: () =>
						import('./pages/docs/docs.module').then((m: typeof import('./pages/docs/docs.module')) => m.DocsModule),
				},
				{
					path: '',
					loadChildren: () =>
						import('./pages/landing/landing.module').then(
							(m: typeof import('./pages/landing/landing.module')) => m.LandingModule,
						),
					pathMatch: 'full',
					data: {hideSidebar: true},
				},
				{path: '**', redirectTo: 'docs/getting-started/installation', pathMatch: 'full'},
			],
			{
				scrollPositionRestoration: 'enabled',
				anchorScrolling: 'enabled',
				scrollOffset: [0, 70],
			},
		),
		NgDocNavbarModule,
		NgDocSidebarModule,
		NgDocButtonIconModule,
		NgDocIconModule,
		NgDocTooltipModule,
		NgDocThemeToggleModule,
		NgDocMediaQueryModule,
	],
	providers: [provideSearchEngine(NgDocDefaultSearchEngine)],
	bootstrap: [AppComponent],
})
export class AppModule {}
