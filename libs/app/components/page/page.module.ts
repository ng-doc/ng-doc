import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';

import {NgDocPageComponent} from './page.component';

@NgModule({
	declarations: [NgDocPageComponent],
	imports: [CommonModule],
	exports: [NgDocPageComponent],
})
export class NgDocPageModule {}
