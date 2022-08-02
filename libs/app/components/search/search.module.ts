import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {NgDocSearchResultModule} from '@ng-doc/app/components/search-result';
import {
	NgDocDropdownModule,
	NgDocDropdownOriginModule,
	NgDocFocusCatcherModule,
	NgDocIconModule,
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
		NgDocSearchResultModule,
		NgDocIconModule,
	],
	exports: [NgDocSearchComponent],
})
export class NgDocSearchModule {}
