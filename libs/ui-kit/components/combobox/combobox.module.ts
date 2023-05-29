import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {NgDocDropdownModule} from '@ng-doc/ui-kit/components/dropdown';
import {PolymorpheusModule} from '@tinkoff/ng-polymorpheus';

import {NgDocComboboxComponent} from './combobox.component';

@NgModule({
	imports: [CommonModule, NgDocDropdownModule, PolymorpheusModule, NgDocComboboxComponent],
	exports: [NgDocComboboxComponent],
})
export class NgDocComboboxModule {}
