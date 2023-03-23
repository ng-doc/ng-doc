import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';

import {NgDocScreenBackDirective, NgDocScreenComponent, NgDocScreenFaceDirective} from './screen.component';

@NgModule({
	declarations: [NgDocScreenComponent, NgDocScreenFaceDirective, NgDocScreenBackDirective],
	imports: [CommonModule],
	exports: [NgDocScreenComponent, NgDocScreenFaceDirective, NgDocScreenBackDirective],
})
export class NgDocScreenModule {}
