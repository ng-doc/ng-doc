import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {RouterLinkWithHref} from '@angular/router';
import {NgDocDotModule} from '@ng-doc/ui-kit';

import {NgDocPageMapComponent} from './page-map.component';
import {NgDocPageMapElementComponent} from './page-map-element/page-map-element.component';

@NgModule({
	declarations: [NgDocPageMapComponent, NgDocPageMapElementComponent],
	imports: [CommonModule, RouterLinkWithHref, NgDocDotModule],
	exports: [NgDocPageMapComponent, NgDocPageMapElementComponent],
})
export class NgDocPageMapModule {}
