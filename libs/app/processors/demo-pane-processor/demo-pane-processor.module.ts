import {NgModule} from '@angular/core';
import {NgDocDemoPaneModule} from '@ng-doc/app/components/demo-pane';

import {NgDocDemoPaneProcessorDirective} from './demo-pane-processor.directive';

@NgModule({
	declarations: [NgDocDemoPaneProcessorDirective],
	imports: [NgDocDemoPaneModule],
	exports: [NgDocDemoPaneProcessorDirective],
})
export class NgDocDemoPaneProcessorModule {}
