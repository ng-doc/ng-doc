import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';

import {NgDocRootComponent} from './root.component';

@NgModule({
	declarations: [NgDocRootComponent],
	imports: [CommonModule],
	exports: [NgDocRootComponent],
})
export class NgDocRootModule {}
