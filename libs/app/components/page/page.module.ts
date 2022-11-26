import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {NgDocSanitizeHtmlModule} from '@ng-doc/app/pipes';
import {
	NgDocBlockquoteProcessorModule,
	NgDocCodeProcessorModule,
	NgDocDeclarationTagProcessorModule,
	NgDocDemoProcessorModule, NgDocIconProcessorModule,
	NgDocLinkProcessorModule,
	NgDocPlaygroundProcessorModule,
	NgDocTagProcessorModule,
} from '@ng-doc/app/processors';

import {NgDocPageComponent} from './page.component';
import {NgDocPageMapModule} from '@ng-doc/app/components/page-map';

@NgModule({
	declarations: [NgDocPageComponent],
	imports: [
		CommonModule,
		NgDocDemoProcessorModule,
		NgDocCodeProcessorModule,
		NgDocTagProcessorModule,
		NgDocPlaygroundProcessorModule,
		NgDocDeclarationTagProcessorModule,
		NgDocBlockquoteProcessorModule,
		NgDocLinkProcessorModule,
		NgDocSanitizeHtmlModule,
		NgDocIconProcessorModule,
		NgDocPageMapModule,
	],
	exports: [NgDocPageComponent],
})
export class NgDocPageModule {}
