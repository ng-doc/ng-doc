import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {NgDocPageMapModule} from '@ng-doc/app/components/toc';
import {NgDocSanitizeHtmlModule} from '@ng-doc/app/pipes/sanitize-html';
import {
	NgDocBlockquoteProcessorModule,
	NgDocCodeProcessorModule,
	NgDocDemoProcessorModule,
	NgDocIconProcessorModule,
	NgDocTooltipProcessorModule,
} from '@ng-doc/app/processors';
import {NgDocButtonIconModule, NgDocIconModule, NgDocMediaQueryModule, NgDocTooltipModule} from '@ng-doc/ui-kit';

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
		NgDocTooltipProcessorModule,
		NgDocButtonIconModule,
		NgDocIconModule,
		NgDocTooltipModule,
	],
	exports: [NgDocPageComponent],
})
export class NgDocPageModule {}
