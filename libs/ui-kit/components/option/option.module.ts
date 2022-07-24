import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';

import {NgDocOptionComponent} from './option.component';

@NgModule({
	declarations: [NgDocOptionComponent],
	imports: [CommonModule],
	exports: [NgDocOptionComponent],
})
export class NgDocOptionModule {}
