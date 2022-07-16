import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';

import {NgDocApiListComponent} from './api-list.component';

@NgModule({
	declarations: [NgDocApiListComponent],
	imports: [CommonModule],
	exports: [NgDocApiListComponent],
})
export class NgDocApiListModule {}
