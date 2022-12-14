import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {NgDocMediaQueryModule} from '@ng-doc/ui-kit';

import {NgDocRootComponent} from './root.component';

@NgModule({
	declarations: [NgDocRootComponent],
	imports: [CommonModule, NgDocMediaQueryModule],
	exports: [NgDocRootComponent],
})
export class NgDocRootModule {}
