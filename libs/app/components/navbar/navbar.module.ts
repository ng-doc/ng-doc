import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';

import {NgDocNavbarComponent} from './navbar.component';

@NgModule({
	declarations: [NgDocNavbarComponent],
	imports: [CommonModule],
	exports: [NgDocNavbarComponent],
})
export class NgDocNavbarModule {}
