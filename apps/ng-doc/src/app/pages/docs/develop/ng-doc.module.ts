import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {NgDocButtonModule, NgDocPaneModule} from '@ng-doc/ui-kit';

import {ButtonDemoComponent} from './button-demo/button-demo.component';

@NgModule({
  imports: [CommonModule, NgDocPaneModule, NgDocButtonModule],
  declarations: [ButtonDemoComponent],
  exports: [],
})
export class DevelopPageModule {}
