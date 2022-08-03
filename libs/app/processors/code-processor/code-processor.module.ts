import {NgModule} from '@angular/core';
import {NgDocCodeModule} from '@ng-doc/app/components/code';

import {NgDocCodeProcessorDirective} from './code-processor.directive';

@NgModule({
	declarations: [NgDocCodeProcessorDirective],
	imports: [NgDocCodeModule],
	exports: [NgDocCodeProcessorDirective],
})
export class NgDocCodeProcessorModule {}
