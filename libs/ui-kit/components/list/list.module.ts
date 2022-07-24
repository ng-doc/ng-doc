import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {NgDocFocusCatcherModule} from '@ng-doc/ui-kit/directives/focus-catcher';

import {NgDocListComponent} from './list.component';

@NgModule({
	declarations: [NgDocListComponent],
	imports: [CommonModule, NgDocFocusCatcherModule],
	exports: [NgDocListComponent],
})
export class NgDocListModule {}
