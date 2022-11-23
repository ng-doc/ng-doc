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
	],
	exports: [NgDocPageComponent],
})
export class NgDocPageModule {}
