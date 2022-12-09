import {NgModule} from '@angular/core';
import {NgDocTagModule} from '@ng-doc/ui-kit';

import { DemoComponent } from './demo/demo.component';

@NgModule({
	declarations: [
    DemoComponent
  ],
	exports: [NgDocTagModule],
})
export class NgDocModule {}
