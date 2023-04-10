import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {NgDocButtonModule, NgDocPaneModule} from '@ng-doc/ui-kit';

import {ButtonDemoComponent} from './button-demo/button-demo.component';
import {DevelopDemoComponent} from './develop-demo/develop-demo.component';

@NgModule({
	imports: [CommonModule, NgDocPaneModule, NgDocButtonModule],
	declarations: [DevelopDemoComponent, ButtonDemoComponent],
	exports: [],
})
export class DevelopPageModule {}
