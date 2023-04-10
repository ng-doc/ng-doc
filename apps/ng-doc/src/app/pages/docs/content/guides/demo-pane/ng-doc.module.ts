import {NgModule} from '@angular/core';
import {NgDocButtonModule} from '@ng-doc/ui-kit';

import {ButtonDemoComponent} from './demos/button-demo/button-demo.component';

@NgModule({
	imports: [NgDocButtonModule],
	// Declare you demo components here
	declarations: [ButtonDemoComponent],
})
export class DemoPanePageModule {}
