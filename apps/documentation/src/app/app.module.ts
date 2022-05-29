import {NgModule} from '@angular/core';
import {BrowserModule} from '@angular/platform-browser';
import {BrowserAnimationsModule} from '@angular/platform-browser/animations';
import {RouterModule} from '@angular/router';
import {NgDocHeaderModule, NgDocModule, NgDocSidebarModule} from '@ng-doc/app';
import {NG_DOC_ROUTING, NgDocGeneratedModule} from '@ng-doc/builder/generated';

import {AppComponent} from './app.component';
import {NxWelcomeComponent} from './nx-welcome.component';

@NgModule({
	declarations: [AppComponent, NxWelcomeComponent],
	imports: [
		BrowserModule,
		BrowserAnimationsModule,
		NgDocModule.forRoot(),
		NgDocGeneratedModule.forRoot(),
		RouterModule.forRoot(NG_DOC_ROUTING),
		NgDocHeaderModule,
		NgDocSidebarModule,
	],
	providers: [],
	bootstrap: [AppComponent],
})
export class AppModule {}
