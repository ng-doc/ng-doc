import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {RouterModule} from '@angular/router';
import {NgDocKindIconModule} from '@ng-doc/app/components/kind-icon';
import {NgDocFilterByTextModule} from '@ng-doc/app/pipes';
import {
	NgDocComboboxModule,
	NgDocDataModule,
	NgDocInputStringModule,
	NgDocInputWrapperModule,
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
		NgDocFilterByTextModule,
		NgDocComboboxModule,
		NgDocOptionModule,
		NgDocDataModule,
		NgDocListModule,
	],
	exports: [NgDocApiListComponent],
})
export class NgDocApiListModule {}
