import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';

import {NgDocTagComponent} from './tag.component';

@NgModule({
	declarations: [NgDocTagComponent],
	imports: [CommonModule],
	exports: [NgDocTagComponent],
})
export class NgDocTagModule {}
