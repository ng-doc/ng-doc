import {CommonModule} from '@angular/common';
import {NgModule, Provider} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {NgDocKindIconModule} from '@ng-doc/app/components/kind-icon';
import {provideTypeControl} from '@ng-doc/app/helpers';
import {NgDocExtractValueModule} from '@ng-doc/app/pipes/extract-value';
import {
	NgDocButtonIconModule,
	NgDocComboboxModule,
	NgDocDataModule,
	NgDocFocusableModule,
	NgDocIconModule,
	NgDocListModule,
	NgDocOptionModule,
	NgDocTextModule,
	NgDocTooltipModule,
} from '@ng-doc/ui-kit';

import {NgDocTypeAliasControlComponent} from './type-alias-control.component';

const provider: Provider = provideTypeControl('NgDocTypeAlias', NgDocTypeAliasControlComponent);

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
		NgDocButtonIconModule,
		NgDocFocusableModule,
		NgDocIconModule,
	],
	providers: [provider],
	exports: [NgDocTypeAliasControlComponent],
})
export class NgDocTypeAliasControlModule {}
