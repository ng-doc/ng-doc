import {NgModule} from '@angular/core';

import {NgDocHighlighterPipe} from './highlighter.pipe';

@NgModule({
	declarations: [NgDocHighlighterPipe],
	exports: [NgDocHighlighterPipe],
})
export class NgDocHighlighterModule {}
