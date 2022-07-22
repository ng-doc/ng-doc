import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {RouterModule} from '@angular/router';
import {NgDocDeclarationIconModule} from '@ng-doc/app/components/declaration-icon';
import {NgDocFilterByTextModule} from '@ng-doc/app/pipes';
import {NgDocInputStringModule, NgDocInputWrapperModule, NgDocTextModule, NgDocTooltipModule} from '@ng-doc/ui-kit';

import {NgDocApiListComponent} from './api-list.component';

@NgModule({
	declarations: [NgDocApiListComponent],
	imports: [
		CommonModule,
		NgDocTextModule,
		NgDocDeclarationIconModule,
		NgDocTooltipModule,
		RouterModule,
		NgDocInputWrapperModule,
		NgDocInputStringModule,
		FormsModule,
		NgDocFilterByTextModule,
	],
	exports: [NgDocApiListComponent],
})
export class NgDocApiListModule {}
