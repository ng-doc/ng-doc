import {HttpClientModule} from '@angular/common/http';
import {NgModule} from '@angular/core';
import {BrowserModule} from '@angular/platform-browser';
import {BrowserAnimationsModule} from '@angular/platform-browser/animations';
import {RouterModule} from '@angular/router';
import {NgDocModule} from '@ng-doc/app';
import {NG_DOC_ROUTING, NgDocGeneratedModule} from '@ng-doc/builder/generated';
import {
	NgDocButtonIconModule,
	NgDocIconModule,
	NgDocTagModule,
	NgDocTooltipModule,
	NgDocUiKitRootModule,
} from '@ng-doc/ui-kit';

import {AppComponent} from './app.component';
import {FloatingCirclePositionControlModule} from './common/floating-circle-position-control/floating-circle-position-control.module';

@NgModule({
	declarations: [AppComponent],
	imports: [
		BrowserModule,
		BrowserAnimationsModule,
		HttpClientModule,
		NgDocModule.forRoot(),
		NgDocUiKitRootModule.forRoot(),
		NgDocGeneratedModule.forRoot(),
		RouterModule.forRoot([{
			path: 'docs',
			children: NG_DOC_ROUTING
		}], {scrollPositionRestoration: 'top', anchorScrolling: 'enabled'}),
		NgDocButtonIconModule,
		NgDocIconModule,
		NgDocTooltipModule,
		NgDocTagModule,
		FloatingCirclePositionControlModule,
	],
	bootstrap: [AppComponent],
})
export class AppModule {}
