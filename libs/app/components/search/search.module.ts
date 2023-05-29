import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {RouterModule} from '@angular/router';
import {NgDocDropdownModule} from '@ng-doc/ui-kit';

import {NgDocSearchComponent} from './search.component';

@NgModule({
	imports: [CommonModule, FormsModule, RouterModule, NgDocDropdownModule, NgDocSearchComponent],
	exports: [NgDocSearchComponent],
})
export class NgDocSearchModule {}
