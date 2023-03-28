import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';

import {ButtonDemoComponent} from './demos/button-demo/button-demo.component';
import {ButtonInlineDemoComponent} from './demos/button-inline-demo/button-inline-demo.component';

@NgModule({
  imports: [CommonModule],
  // Declare you demo components here
  declarations: [ButtonDemoComponent, ButtonInlineDemoComponent],
})
export class DemoPanePageModule {}
