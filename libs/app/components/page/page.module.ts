import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {NgDocDemoRendererModule} from '@ng-doc/app/directives';
import {NgDocMarkdownModule} from '@ng-doc/app/directives/markdown';

import {NgDocPageComponent} from './page.component';

@NgModule({
	declarations: [NgDocPageComponent],
	imports: [CommonModule, NgDocMarkdownModule, NgDocDemoRendererModule],
	exports: [NgDocPageComponent],
})
export class NgDocPageModule {}
