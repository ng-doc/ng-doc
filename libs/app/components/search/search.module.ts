import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {
	NgDocDropdownModule,
	NgDocDropdownOriginModule,
	NgDocFocusCatcherModule,
	NgDocInputStringModule,
	NgDocInputWrapperModule,
} from '@ng-doc/ui-kit';

import {NgDocSearchComponent} from './search.component';

@NgModule({
	declarations: [NgDocSearchComponent],
	imports: [
		CommonModule,
		NgDocInputWrapperModule,
		NgDocInputStringModule,
		NgDocDropdownModule,
		NgDocDropdownOriginModule,
		NgDocFocusCatcherModule,
		FormsModule,
	],
	exports: [NgDocSearchComponent],
})
export class NgDocSearchModule {}
