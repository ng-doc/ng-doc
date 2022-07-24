import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {NgDocComboboxHostModule} from '@ng-doc/ui-kit/cdk/combobox-host';
import {NgDocDropdownModule} from '@ng-doc/ui-kit/components/dropdown';
import {NgDocInputWrapperModule} from '@ng-doc/ui-kit/components/input-wrapper';
import {NgDocFocusCatcherModule} from '@ng-doc/ui-kit/directives';
import {NgDocDropdownOriginModule} from '@ng-doc/ui-kit/directives/dropdown-origin';
import {NgDocInputStringModule} from '@ng-doc/ui-kit/directives/input-string';

import {NgDocComboboxComponent} from './combobox.component';

@NgModule({
	declarations: [NgDocComboboxComponent],
	imports: [
		CommonModule,
		NgDocInputWrapperModule,
		NgDocInputStringModule,
		NgDocDropdownOriginModule,
		NgDocDropdownModule,
		NgDocFocusCatcherModule,
		NgDocComboboxHostModule,
	],
	exports: [NgDocComboboxComponent],
})
export class NgDocComboboxModule {}
