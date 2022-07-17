import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';

import {NgDocToggleComponent} from './toggle.component';

@NgModule({
	declarations: [NgDocToggleComponent],
	imports: [CommonModule],
	exports: [NgDocToggleComponent],
})
export class NgDocToggleModule {}
