import {NgModule} from '@angular/core';

import {NgDocTitleProcessorDirective} from './title-processor.directive';

@NgModule({
	declarations: [NgDocTitleProcessorDirective],
	exports: [NgDocTitleProcessorDirective],
})
export class NgDocTitleProcessorModule {}
