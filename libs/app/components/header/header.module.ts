import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';

import {NgDocHeaderComponent} from './header.component';

@NgModule({
	declarations: [NgDocHeaderComponent],
	imports: [CommonModule],
	exports: [NgDocHeaderComponent],
})
export class NgDocHeaderModule {}
