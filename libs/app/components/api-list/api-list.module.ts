import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {RouterModule} from '@angular/router';
import {NgDocDeclarationIconModule} from '@ng-doc/app/components/declaration-icon';
import {NgDocTextModule, NgDocTooltipModule} from '@ng-doc/ui-kit';

import {NgDocApiListComponent} from './api-list.component';

@NgModule({
	declarations: [NgDocApiListComponent],
	imports: [CommonModule, NgDocTextModule, NgDocDeclarationIconModule, NgDocTooltipModule, RouterModule],
	exports: [NgDocApiListComponent],
})
export class NgDocApiListModule {}
