import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';

import {NgDocDotComponent} from './dot.component';

@NgModule({
	declarations: [NgDocDotComponent],
	imports: [CommonModule],
	exports: [NgDocDotComponent],
})
export class NgDocDotModule {}
