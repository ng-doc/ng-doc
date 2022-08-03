import {NgModule} from '@angular/core';
import {NgDocBlockquoteProcessorDirective} from './blockquote-processor.directive';
import {NgDocBlockquoteModule} from '@ng-doc/ui-kit';

@NgModule({
	declarations: [NgDocBlockquoteProcessorDirective],
	imports: [NgDocBlockquoteModule],
	exports: [NgDocBlockquoteProcessorDirective],
})
export class NgDocBlockquoteProcessorModule {}
