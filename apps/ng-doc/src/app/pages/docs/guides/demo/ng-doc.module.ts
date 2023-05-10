import {NgModule} from '@angular/core';
import {NgDocButtonModule} from '@ng-doc/ui-kit/components/button';

import {ButtonDemoComponent} from './demos/button-demo/button-demo.component';

@NgModule({
  // Import dependencies
  imports: [NgDocButtonModule],
  // Declarations for your demos
  declarations: [ButtonDemoComponent],
})
export class DemoPageModule {}
