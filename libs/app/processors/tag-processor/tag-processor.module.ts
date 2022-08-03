import {NgModule} from '@angular/core';
import {NgDocTagModule} from '@ng-doc/ui-kit';

import {NgDocTagProcessorDirective} from './tag-processor.directive';

@NgModule({
	declarations: [NgDocTagProcessorDirective],
	imports: [NgDocTagModule],
	exports: [NgDocTagProcessorDirective],
})
export class NgDocTagProcessorModule {}
