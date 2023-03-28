import {NgModule} from '@angular/core';

import {NgDocLinkProcessorDirective} from './link-processor.directive';

@NgModule({
	declarations: [NgDocLinkProcessorDirective],
	exports: [NgDocLinkProcessorDirective],
})
export class NgDocLinkProcessorModule {}
