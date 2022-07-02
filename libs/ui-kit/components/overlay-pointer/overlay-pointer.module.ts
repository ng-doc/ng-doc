import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';

import {NgDocOverlayPointerComponent} from './overlay-pointer.component';

@NgModule({
	declarations: [NgDocOverlayPointerComponent],
	exports: [NgDocOverlayPointerComponent],
	imports: [CommonModule],
})
export class NgDocOverlayPointerModule {}
