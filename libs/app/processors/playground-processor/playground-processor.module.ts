import {NgModule} from '@angular/core';
import {NgDocPlaygroundModule} from '@ng-doc/app/components/playground';

import {NgDocPlaygroundProcessorDirective} from './playground-processor.directive';

@NgModule({
	declarations: [NgDocPlaygroundProcessorDirective],
	imports: [NgDocPlaygroundModule],
	exports: [NgDocPlaygroundProcessorDirective],
})
export class NgDocPlaygroundProcessorModule {}
