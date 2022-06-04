import {NgModule} from '@angular/core';

import {NgDocCodeProcessorDirective} from './code-processor.directive';

@NgModule({
	declarations: [NgDocCodeProcessorDirective],
	exports: [NgDocCodeProcessorDirective],
})
export class NgDocCodeProcessorModule {}
