import {NgModule} from '@angular/core';
import {NgDocButtonModule} from '@ng-doc/ui-kit/components/button';

import {ButtonDemoComponent} from './demos/button-demo/button-demo.component';
import {ButtonInlineDemoComponent} from './demos/button-inline-demo/button-inline-demo.component';

@NgModule({
  // Import dependencies
  imports: [NgDocButtonModule],
  // Declarations for your demos
  declarations: [ButtonDemoComponent, ButtonInlineDemoComponent],
})
export class DemoPageModule {}
