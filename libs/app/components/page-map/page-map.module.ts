import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {RouterLinkWithHref} from '@angular/router';

import {NgDocPageMapComponent} from './page-map.component';

@NgModule({
	declarations: [NgDocPageMapComponent],
	imports: [CommonModule, RouterLinkWithHref],
	exports: [NgDocPageMapComponent],
})
export class NgDocPageMapModule {}
