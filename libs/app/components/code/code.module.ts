import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {NgDocLinkProcessorModule} from '@ng-doc/app/processors/link-processor';
import {NgDocButtonIconModule, NgDocIconModule, NgDocTextModule, NgDocTooltipModule} from '@ng-doc/ui-kit';

import {NgDocCodeComponent} from './code.component';

@NgModule({
	declarations: [NgDocCodeComponent],
	imports: [
		CommonModule,
		NgDocTextModule,
		NgDocButtonIconModule,
		NgDocIconModule,
		NgDocTooltipModule,
		NgDocLinkProcessorModule,
	],
	exports: [NgDocCodeComponent],
})
export class NgDocCodeModule {}
