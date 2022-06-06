import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {NgDocCodeModule} from '@ng-doc/app/components/code';
import {NgDocIconModule, NgDocTabGroupModule, NgDocTextModule} from '@ng-doc/ui-kit';

import {NgDocDemoViewerComponent} from './demo-viewer.component';

@NgModule({
	declarations: [NgDocDemoViewerComponent],
	imports: [CommonModule, NgDocTabGroupModule, NgDocCodeModule, NgDocIconModule, NgDocTextModule],
	exports: [NgDocDemoViewerComponent],
})
export class NgDocDemoViewerModule {}
