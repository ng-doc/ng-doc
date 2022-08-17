import {NgModule} from '@angular/core';
import {NgDocApiDisplayerModule} from '@ng-doc/app/components/api-displayer';

import {NgDocApiProcessorDirective} from './api-processor.directive';

@NgModule({
	declarations: [NgDocApiProcessorDirective],
	imports: [NgDocApiDisplayerModule],
	exports: [NgDocApiProcessorDirective],
})
export class NgDocApiProcessorModule {}
