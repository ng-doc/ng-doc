import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {NgDocScreenModule} from '@ng-doc/ui-kit';

import {DevelopDemoComponent} from './develop-demo/develop-demo.component';

@NgModule({
	imports: [CommonModule, NgDocScreenModule],
	declarations: [DevelopDemoComponent],
	exports: [],
})
export class DevelopPageModule {}
