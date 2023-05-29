import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {FormsModule, ReactiveFormsModule} from '@angular/forms';
import {RouterModule} from '@angular/router';
import {NgDocComboboxModule} from '@ng-doc/ui-kit';

import {NgDocApiListComponent} from './api-list.component';

@NgModule({
	imports: [CommonModule, RouterModule, FormsModule, NgDocComboboxModule, ReactiveFormsModule, NgDocApiListComponent],
	exports: [NgDocApiListComponent],
})
export class NgDocApiListModule {}
