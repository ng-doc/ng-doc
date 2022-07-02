import {NgModule} from '@angular/core';

import {NgDocPlaygroundProcessorDirective} from './playground-processor.directive';

@NgModule({
	declarations: [NgDocPlaygroundProcessorDirective],
	exports: [NgDocPlaygroundProcessorDirective],
})
export class NgDocPlaygroundProcessorModule {}
