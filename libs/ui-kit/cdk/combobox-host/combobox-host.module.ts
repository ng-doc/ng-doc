import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {NgDocDropdownHandlerModule} from '@ng-doc/ui-kit/directives/dropdown-handler';
import {NgDocFocusCatcherModule} from '@ng-doc/ui-kit/directives/focus-catcher';

import {NgDocComboboxHostComponent} from './combobox-host.component';

@NgModule({
	declarations: [NgDocComboboxHostComponent],
	imports: [CommonModule, NgDocFocusCatcherModule, NgDocDropdownHandlerModule],
	exports: [NgDocComboboxHostComponent],
})
export class NgDocComboboxHostModule {}
