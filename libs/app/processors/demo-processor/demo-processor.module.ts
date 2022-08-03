import {NgModule} from '@angular/core';
import {NgDocDemoModule} from '@ng-doc/app/components/demo';

import {NgDocDemoProcessorDirective} from './demo-processor.directive';

@NgModule({
	declarations: [NgDocDemoProcessorDirective],
	imports: [NgDocDemoModule],
	exports: [NgDocDemoProcessorDirective],
})
export class NgDocDemoProcessorModule {}
