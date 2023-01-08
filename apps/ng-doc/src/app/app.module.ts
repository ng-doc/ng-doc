import {HttpClientModule} from '@angular/common/http';
import {NgModule} from '@angular/core';
import {BrowserModule} from '@angular/platform-browser';
import {BrowserAnimationsModule} from '@angular/platform-browser/animations';
import {RouterModule} from '@angular/router';
import {NgDocThemeToggleModule} from '@ng-doc/app';
import {NgDocNavbarModule} from '@ng-doc/app/components/navbar';
import {NgDocRootModule} from '@ng-doc/app/components/root';
import {NgDocSidebarModule} from '@ng-doc/app/components/sidebar';
import {NgDocModule} from '@ng-doc/app/modules/root';
import {NgDocGeneratedModule} from '@ng-doc/generated';
import {NgDocMediaQueryModule} from '@ng-doc/ui-kit';
import {NgDocButtonIconModule} from '@ng-doc/ui-kit/components/button-icon';
import {NgDocIconModule} from '@ng-doc/ui-kit/components/icon';
import {NgDocTagModule} from '@ng-doc/ui-kit/components/tag';
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
				{path: '', redirectTo: 'getting-started/installation', pathMatch: 'full'},
				{
					path: '',
					loadChildren: () =>
						import('./docs/docs.module').then((m: typeof import('./docs/docs.module')) => m.DocsModule),
				},
			],
			{
				scrollPositionRestoration: 'enabled',
				anchorScrolling: 'enabled',
				scrollOffset: () => [0, 70],
			},
		),
		NgDocRootModule,
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
