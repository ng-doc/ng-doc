import {NgModule} from '@angular/core';

import {NgDocSanitizeHtmlPipe} from './sanitize-html.pipe';

@NgModule({
	declarations: [NgDocSanitizeHtmlPipe],
	exports: [NgDocSanitizeHtmlPipe],
})
export class NgDocSanitizeHtmlModule {}
