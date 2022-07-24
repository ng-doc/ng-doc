import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {NgDocKindIconModule} from '@ng-doc/app/components';
import {provideTypeControl} from '@ng-doc/app/helpers';
import {NgDocExtractValueModule} from '@ng-doc/app/pipes/extract-value';
import {
	NgDocComboboxModule,
	NgDocDataModule,
	NgDocListModule,
	NgDocOptionModule,
	NgDocTextModule,
	NgDocTooltipModule,
} from '@ng-doc/ui-kit';

import {NgDocTypeAliasControlComponent} from './type-alias-control.component';

@NgModule({
	declarations: [NgDocTypeAliasControlComponent],
	imports: [
		CommonModule,
		NgDocComboboxModule,
		NgDocDataModule,
		FormsModule,
		NgDocOptionModule,
		NgDocListModule,
		NgDocExtractValueModule,
		NgDocTextModule,
		NgDocKindIconModule,
		NgDocTooltipModule,
	],
	providers: [provideTypeControl<string>('NgDocTypeAlias', NgDocTypeAliasControlComponent)],
	exports: [NgDocTypeAliasControlComponent],
})
export class NgDocTypeAliasControlModule {}
