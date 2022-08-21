import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {NgDocIconModule} from '@ng-doc/ui-kit/components/icon';
import {NgDocCheckedChangeModule} from '@ng-doc/ui-kit/directives/checked-change';
import {NgDocFocusableModule} from '@ng-doc/ui-kit/directives/focusable';

import {NgDocCheckboxComponent} from './checkbox.component';

@NgModule({
	declarations: [NgDocCheckboxComponent],
	imports: [CommonModule, NgDocIconModule, NgDocFocusableModule, NgDocCheckedChangeModule],
	exports: [NgDocCheckboxComponent],
})
export class NgDocCheckboxModule {}
