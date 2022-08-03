import {NgModule} from '@angular/core';
import {NgDocHeaderModule} from '@ng-doc/app/components/header';

import {NgDocTitleProcessorDirective} from './title-processor.directive';

@NgModule({
	declarations: [NgDocTitleProcessorDirective],
	imports: [NgDocHeaderModule],
	exports: [NgDocTitleProcessorDirective],
})
export class NgDocTitleProcessorModule {}
