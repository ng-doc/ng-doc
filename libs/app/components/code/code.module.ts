import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';

import {NgDocCodeComponent} from './code.component';

@NgModule({
	declarations: [NgDocCodeComponent],
	imports: [CommonModule],
	exports: [NgDocCodeComponent],
})
export class NgDocCodeModule {}
