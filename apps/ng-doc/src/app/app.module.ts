import {HttpClientModule} from '@angular/common/http';
import {NgModule} from '@angular/core';
import {BrowserModule} from '@angular/platform-browser';
import {BrowserAnimationsModule} from '@angular/platform-browser/animations';
import {RouterModule} from '@angular/router';
import {NgDocNavbarModule} from '@ng-doc/app';
import {NgDocSidebarModule} from '@ng-doc/app/components/sidebar';
import {NgDocThemeToggleModule} from '@ng-doc/app/components/theme-toggle';
import {NgDocModule} from '@ng-doc/app/modules/root';
import {NgDocGeneratedModule} from '@ng-doc/generated';
import {NgDocButtonIconModule} from '@ng-doc/ui-kit/components/button-icon';
import {NgDocIconModule} from '@ng-doc/ui-kit/components/icon';
import {NgDocTagModule} from '@ng-doc/ui-kit/components/tag';
import {NgDocMediaQueryModule} from '@ng-doc/ui-kit/directives/media-query';
import {NgDocTooltipModule} from '@ng-doc/ui-kit/directives/tooltip';

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
					path: '',
					loadChildren: () =>
						import('./docs/docs.module').then((m: typeof import('./docs/docs.module')) => m.DocsModule),
				},
				{path: '**', redirectTo: 'getting-started/installation', pathMatch: 'full'},
			],
			{
				scrollPositionRestoration: 'enabled',
				anchorScrolling: 'enabled',
				scrollOffset: [0, 70],
			},
		),
		NgDocNavbarModule,
		NgDocSidebarModule,
		NgDocTagModule,
		NgDocButtonIconModule,
		NgDocIconModule,
		NgDocTooltipModule,
		NgDocThemeToggleModule,
		NgDocMediaQueryModule,
	],
	bootstrap: [AppComponent],
})
export class AppModule {}
