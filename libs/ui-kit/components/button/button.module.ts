import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';

import {NgDocButtonComponent} from './button.component';

@NgModule({
	declarations: [NgDocButtonComponent],
	imports: [CommonModule],
	exports: [NgDocButtonComponent],
})
export class NgDocButtonModule {}
