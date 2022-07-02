import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';

import {NgDocPlaygroundComponent} from './playground.component';

@NgModule({
	declarations: [NgDocPlaygroundComponent],
	imports: [CommonModule],
	exports: [NgDocPlaygroundComponent],
})
export class NgDocPlaygroundModule {}
