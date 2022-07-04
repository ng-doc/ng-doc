import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';

import {NgDocPlaygroundDemoComponent} from './playground-demo.component';

@NgModule({
	declarations: [NgDocPlaygroundDemoComponent],
	imports: [CommonModule],
	exports: [NgDocPlaygroundDemoComponent],
})
export class NgDocPlaygroundDemoModule {}
