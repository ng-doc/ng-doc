import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';

import {NgDocLineComponent} from './line.component';

@NgModule({
	declarations: [NgDocLineComponent],
	imports: [CommonModule],
	exports: [NgDocLineComponent],
})
export class NgDocLineModule {}
