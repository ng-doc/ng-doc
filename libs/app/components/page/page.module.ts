import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {NgDocSanitizeHtmlModule} from '@ng-doc/app/pipes';
import {
	NgDocBlockquoteProcessorModule,
	NgDocCodeProcessorModule,
	NgDocDeclarationTagProcessorModule,
	NgDocDemoProcessorModule,
	NgDocLinkProcessorModule,
	NgDocPlaygroundProcessorModule,
	NgDocTagProcessorModule,
	NgDocTitleProcessorModule,
} from '@ng-doc/app/processors';

import {NgDocPageComponent} from './page.component';

@NgModule({
	declarations: [NgDocPageComponent],
	imports: [
		CommonModule,
		NgDocDemoProcessorModule,
		NgDocTitleProcessorModule,
		NgDocCodeProcessorModule,
		NgDocTagProcessorModule,
		NgDocPlaygroundProcessorModule,
		NgDocDeclarationTagProcessorModule,
		NgDocBlockquoteProcessorModule,
		NgDocLinkProcessorModule,
		NgDocSanitizeHtmlModule,
	],
	exports: [NgDocPageComponent],
})
export class NgDocPageModule {}
