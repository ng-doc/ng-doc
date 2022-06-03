import {HttpClientModule} from '@angular/common/http';
import {NgModule} from '@angular/core';
import {BrowserModule} from '@angular/platform-browser';
import {BrowserAnimationsModule} from '@angular/platform-browser/animations';
import {RouterModule} from '@angular/router';
import {NgDocHeaderModule, NgDocModule, NgDocSidebarModule} from '@ng-doc/app';
import {NG_DOC_ROUTING, NgDocGeneratedModule} from '@ng-doc/builder/generated';
import {NgDocIconModule, NgDocUiKitRootModule} from '@ng-doc/ui-kit';

import {AppComponent} from './app.component';
import {NxWelcomeComponent} from './nx-welcome.component';

@NgModule({
	declarations: [AppComponent, NxWelcomeComponent],
	imports: [
		BrowserModule,
		BrowserAnimationsModule,
		HttpClientModule,
		NgDocModule.forRoot(),
		NgDocUiKitRootModule.forRoot(),
		NgDocGeneratedModule.forRoot(),
		RouterModule.forRoot(NG_DOC_ROUTING),
		NgDocHeaderModule,
		NgDocSidebarModule,
		NgDocIconModule,
	],
	providers: [],
	bootstrap: [AppComponent],
})
export class AppModule {}
