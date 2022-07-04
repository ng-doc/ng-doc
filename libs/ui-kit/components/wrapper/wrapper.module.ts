import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';

import {NgDocWrapperComponent} from './wrapper.component';

@NgModule({
	declarations: [NgDocWrapperComponent],
	imports: [CommonModule],
	exports: [NgDocWrapperComponent],
})
export class NgDocWrapperModule {}
