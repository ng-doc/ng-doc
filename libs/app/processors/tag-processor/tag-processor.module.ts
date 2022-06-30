import {NgModule} from '@angular/core';

import {NgDocTagProcessorDirective} from './tag-processor.directive';

@NgModule({
	declarations: [NgDocTagProcessorDirective],
	exports: [NgDocTagProcessorDirective],
})
export class NgDocTagProcessorModule {}
