import {NgModule} from '@angular/core';
import {NgDocTooltipModule} from '@ng-doc/ui-kit';

import {NgDocTooltipProcessorDirective} from './tooltip-processor.directive';
import { NgDocTooltipWrapperComponent } from './tooltip-wrapper.component';

@NgModule({
	declarations: [NgDocTooltipProcessorDirective, NgDocTooltipWrapperComponent],
	exports: [NgDocTooltipProcessorDirective],
	imports: [NgDocTooltipModule],
})
export class NgDocTooltipProcessorModule {}
