import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {RouterLink} from '@angular/router';

import {NgDocPageLinkComponent} from './page-link.component';

@NgModule({
	declarations: [NgDocPageLinkComponent],
	imports: [CommonModule, RouterLink],
	exports: [NgDocPageLinkComponent],
})
export class NgDocPageLinkModule {}
