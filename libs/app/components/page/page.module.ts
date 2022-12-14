import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {NgDocPageMapModule} from '@ng-doc/app/components/page-map';
import {NgDocSanitizeHtmlModule} from '@ng-doc/app/pipes/sanitize-html';
import {
	NgDocBlockquoteProcessorModule,
	NgDocCodeProcessorModule,
	NgDocDemoProcessorModule,
	NgDocIconProcessorModule,
} from '@ng-doc/app/processors';
import {NgDocMediaQueryModule} from '@ng-doc/ui-kit';

import {NgDocPageComponent} from './page.component';

@NgModule({
	declarations: [NgDocPageComponent],
	imports: [
		CommonModule,
		NgDocDemoProcessorModule,
		NgDocCodeProcessorModule,
		NgDocBlockquoteProcessorModule,
		NgDocSanitizeHtmlModule,
		NgDocIconProcessorModule,
		NgDocPageMapModule,
		NgDocMediaQueryModule,
	],
	exports: [NgDocPageComponent],
})
export class NgDocPageModule {}
