import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';

import {NgDocDemoViewerComponent} from './demo-viewer.component';

@NgModule({
	declarations: [NgDocDemoViewerComponent],
	imports: [CommonModule],
	exports: [NgDocDemoViewerComponent],
})
export class NgDocDemoViewerModule {}
