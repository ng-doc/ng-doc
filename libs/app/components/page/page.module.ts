import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {NgDocMarkdownModule} from '@ng-doc/app/directives/markdown';
import {NgDocDemoProcessorModule} from '@ng-doc/app/processors';

import {NgDocPageComponent} from './page.component';

@NgModule({
	declarations: [NgDocPageComponent],
	imports: [CommonModule, NgDocMarkdownModule, NgDocDemoProcessorModule],
	exports: [NgDocPageComponent],
})
export class NgDocPageModule {}
