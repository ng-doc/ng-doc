import {NgModule} from '@angular/core';

import {NgDocCodeHighlighterDirective} from './code-highlighter.directive';

@NgModule({
	declarations: [NgDocCodeHighlighterDirective],
	exports: [NgDocCodeHighlighterDirective],
})
export class NgDocCodeHighlighterModule {}
