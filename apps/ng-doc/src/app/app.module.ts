import {HttpClientModule} from '@angular/common/http';
import {NgModule} from '@angular/core';
import {BrowserModule} from '@angular/platform-browser';
import {BrowserAnimationsModule} from '@angular/platform-browser/animations';
import {RouterModule} from '@angular/router';

import {AppComponent} from './app.component';
import {NgDocNavbarModule} from '@ng-doc/app/components/navbar';
import {NgDocButtonIconModule} from '@ng-doc/ui-kit/components/button-icon';
import {NgDocIconModule} from '@ng-doc/ui-kit/components/icon';
import {NgDocTagModule} from '@ng-doc/ui-kit/components/tag';
import {NgDocTooltipModule} from '@ng-doc/ui-kit/directives/tooltip';
import {NgDocRootModule} from '@ng-doc/app/components/root';
import {NgDocModule} from '@ng-doc/app/modules/root';
import {NgDocUiKitRootModule} from '@ng-doc/ui-kit/modules/root';
import {NgDocGeneratedModule} from '@ng-doc/builder/generated';
import {NgDocSidebarModule} from '@ng-doc/app/components/sidebar';

@NgModule({
	declarations: [AppComponent],
	imports: [
		BrowserModule,
		BrowserAnimationsModule,
		HttpClientModule,
		NgDocModule.forRoot(),
		NgDocUiKitRootModule.forRoot(),
		NgDocGeneratedModule.forRoot(),
		RouterModule.forRoot([
			{path: '', redirectTo: 'getting-started/installation', pathMatch: 'full'},
			{
				path: '',
				loadChildren: () => import('./docs/docs.module').then((m) => m.DocsModule),
			},
		]),
		NgDocRootModule,
		NgDocNavbarModule,
		NgDocSidebarModule,
		NgDocTagModule,
		NgDocButtonIconModule,
		NgDocIconModule,
		NgDocTooltipModule,
	],
	bootstrap: [AppComponent],
})
export class AppModule {}
