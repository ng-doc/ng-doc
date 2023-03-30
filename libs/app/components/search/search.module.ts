import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {RouterModule} from '@angular/router';
import {NgDocSanitizeHtmlModule} from '@ng-doc/app/pipes';
import {
	NgDocAutofocusModule,
	NgDocBindModule,
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
	NgDocRunModule,
	NgDocSmoothResizeModule,
	NgDocSpinnerModule,
	NgDocTagModule,
	NgDocTextModule,
} from '@ng-doc/ui-kit';

import {NgDocSearchComponent} from './search.component';

@NgModule({
	declarations: [NgDocSearchComponent],
	imports: [
		CommonModule,
		FormsModule,
		RouterModule,
		NgDocInputWrapperModule,
		NgDocInputStringModule,
		NgDocDropdownModule,
		NgDocDropdownOriginModule,
		NgDocFocusCatcherModule,
		NgDocIconModule,
		NgDocButtonIconModule,
		NgDocAutofocusModule,
		NgDocTagModule,
		NgDocHotkeyModule,
		NgDocDataListGroupModule,
		NgDocHighlighterModule,
		NgDocTextModule,
		NgDocLetModule,
		NgDocRunModule,
		NgDocBindModule,
		NgDocSanitizeHtmlModule,
		NgDocSpinnerModule,
		NgDocSmoothResizeModule,
	],
	exports: [NgDocSearchComponent],
})
export class NgDocSearchModule {}
