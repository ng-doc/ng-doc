import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {RouterLinkWithHref} from '@angular/router';

import {NgDocKeywordLinkComponent} from './keyword-link.component';

@NgModule({
	declarations: [NgDocKeywordLinkComponent],
	imports: [CommonModule, RouterLinkWithHref],
	exports: [NgDocKeywordLinkComponent]
})
export class NgDocKeywordLinkModule {}
