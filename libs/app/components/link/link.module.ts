import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {RouterLinkWithHref} from '@angular/router';

import {NgDocLinkComponent} from './link.component';

@NgModule({
	declarations: [NgDocLinkComponent],
	imports: [CommonModule, RouterLinkWithHref],
	exports: [NgDocLinkComponent],
})
export class NgDocLinkModule {}
