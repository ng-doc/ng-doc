import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {RouterModule} from '@angular/router';
import {NgDocTextModule} from '@ng-doc/ui-kit';

import {NgDocTitleComponent} from './title.component';

@NgModule({
	declarations: [NgDocTitleComponent],
	imports: [CommonModule, NgDocTextModule, RouterModule],
	exports: [NgDocTitleComponent],
})
export class NgDocTitleModule {}
