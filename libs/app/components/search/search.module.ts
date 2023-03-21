import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {
	NgDocAutofocusModule,
	NgDocButtonIconModule,
	NgDocDataListGroupModule,
	NgDocDropdownModule,
	NgDocDropdownOriginModule,
	NgDocFocusCatcherModule,
	NgDocHotkeyModule,
	NgDocIconModule,
	NgDocInputStringModule,
	NgDocInputWrapperModule,
	NgDocTagModule,
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
		NgDocIconModule,
		NgDocButtonIconModule,
		NgDocAutofocusModule,
		NgDocTagModule,
		NgDocHotkeyModule,
		NgDocDataListGroupModule,
	],
	exports: [NgDocSearchComponent],
})
export class NgDocSearchModule {}
