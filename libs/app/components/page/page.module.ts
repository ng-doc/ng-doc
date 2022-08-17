import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {NgDocMarkdownModule} from '@ng-doc/app/directives/markdown';
import {
	NgDocApiProcessorModule,
	NgDocBlockquoteProcessorModule,
	NgDocCodeProcessorModule,
	NgDocDeclarationTagProcessorModule,
	NgDocDemoProcessorModule,
	NgDocPlaygroundProcessorModule,
	NgDocTagProcessorModule,
	NgDocTitleProcessorModule,
} from '@ng-doc/app/processors';

import {NgDocPageComponent} from './page.component';

@NgModule({
	declarations: [NgDocPageComponent],
	imports: [
		CommonModule,
		NgDocMarkdownModule,
		NgDocDemoProcessorModule,
		NgDocTitleProcessorModule,
		NgDocCodeProcessorModule,
		NgDocTagProcessorModule,
		NgDocPlaygroundProcessorModule,
		NgDocDeclarationTagProcessorModule,
		NgDocBlockquoteProcessorModule,
		NgDocApiProcessorModule,
	],
	exports: [NgDocPageComponent],
})
export class NgDocPageModule {}
