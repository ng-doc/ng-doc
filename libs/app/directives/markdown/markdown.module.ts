import {NgModule} from '@angular/core';

import {NgDocMarkdownDirective} from './markdown.directive';

@NgModule({
	declarations: [NgDocMarkdownDirective],
	exports: [NgDocMarkdownDirective],
})
export class NgDocMarkdownModule {}
