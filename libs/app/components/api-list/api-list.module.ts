import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {FormsModule, ReactiveFormsModule} from '@angular/forms';
import {RouterModule} from '@angular/router';
import {NgDocKindIconModule} from '@ng-doc/app/components/kind-icon';
import {
	NgDocAutofocusModule,
	NgDocComboboxModule,
	NgDocDataModule,
	NgDocIconModule,
	NgDocInputStringModule,
	NgDocInputWrapperModule,
	NgDocLabelModule,
	NgDocListModule,
	NgDocOptionModule,
	NgDocTextModule,
	NgDocTooltipModule,
} from '@ng-doc/ui-kit';

import {NgDocApiListComponent} from './api-list.component';

@NgModule({
	declarations: [NgDocApiListComponent],
	imports: [
		CommonModule,
		NgDocTextModule,
		NgDocKindIconModule,
		NgDocTooltipModule,
		RouterModule,
		NgDocInputWrapperModule,
		NgDocInputStringModule,
		FormsModule,
		NgDocComboboxModule,
		NgDocOptionModule,
		NgDocDataModule,
		NgDocListModule,
		NgDocLabelModule,
		ReactiveFormsModule,
		NgDocIconModule,
		NgDocAutofocusModule,
	],
	exports: [NgDocApiListComponent],
})
export class NgDocApiListModule {}
