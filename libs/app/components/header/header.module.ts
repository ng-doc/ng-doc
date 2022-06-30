import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {RouterModule} from '@angular/router';
import {NgDocIconModule, NgDocTextModule} from '@ng-doc/ui-kit';

import {NgDocHeaderComponent} from './header.component';

@NgModule({
	declarations: [NgDocHeaderComponent],
	imports: [CommonModule, NgDocTextModule, RouterModule, NgDocIconModule],
	exports: [NgDocHeaderComponent],
})
export class NgDocHeaderModule {}
