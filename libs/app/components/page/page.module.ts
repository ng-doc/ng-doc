import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {NgDocPageMapModule} from '@ng-doc/app/components/page-map';
import {NgDocSanitizeHtmlModule} from '@ng-doc/app/pipes/sanitize-html';
import {
	NgDocBlockquoteProcessorModule,
	NgDocCodeProcessorModule,
	NgDocDemoProcessorModule,
	NgDocIconProcessorModule,
	NgDocPlaygroundProcessorModule,
} from '@ng-doc/app/processors';

import {NgDocPageComponent} from './page.component';

@NgModule({
	declarations: [NgDocPageComponent],
	imports: [
		CommonModule,
		NgDocDemoProcessorModule,
		NgDocCodeProcessorModule,
		NgDocPlaygroundProcessorModule,
		NgDocBlockquoteProcessorModule,
		NgDocSanitizeHtmlModule,
		NgDocIconProcessorModule,
		NgDocPageMapModule,
	],
	exports: [NgDocPageComponent],
})
export class NgDocPageModule {}
