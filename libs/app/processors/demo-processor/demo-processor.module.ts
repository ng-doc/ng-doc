import {NgModule} from '@angular/core';

import {NgDocDemoProcessorDirective} from './demo-processor.directive';

@NgModule({
	declarations: [NgDocDemoProcessorDirective],
	exports: [NgDocDemoProcessorDirective],
})
export class NgDocDemoProcessorModule {}
