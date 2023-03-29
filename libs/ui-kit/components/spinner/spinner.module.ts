import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';

import {NgDocSpinnerComponent} from './spinner.component';

@NgModule({
	declarations: [NgDocSpinnerComponent],
	imports: [CommonModule],
	exports: [NgDocSpinnerComponent],
})
export class NgDocSpinnerModule {}
