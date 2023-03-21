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
	NgDocHighlighterModule,
	NgDocHotkeyModule,
	NgDocIconModule,
	NgDocInputStringModule,
	NgDocInputWrapperModule,
	NgDocLetModule,
	NgDocTagModule,
	NgDocTextModule,
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
		NgDocHighlighterModule,
		NgDocTextModule,
		NgDocLetModule,
	],
	exports: [NgDocSearchComponent],
})
export class NgDocSearchModule {}
