import {NgModule} from '@angular/core';
import {NgDocBlockquoteModule} from '@ng-doc/ui-kit';

import {NgDocBlockquoteProcessorDirective} from './blockquote-processor.directive';

@NgModule({
	declarations: [NgDocBlockquoteProcessorDirective],
	imports: [NgDocBlockquoteModule],
	exports: [NgDocBlockquoteProcessorDirective],
})
export class NgDocBlockquoteProcessorModule {}
