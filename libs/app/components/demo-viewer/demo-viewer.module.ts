import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {NgDocCodeModule} from '@ng-doc/app/components/code';
import {NgDocIconModule, NgDocTabGroupModule, NgDocTextModule} from '@ng-doc/ui-kit';
import {PolymorpheusModule} from '@tinkoff/ng-polymorpheus';

import {NgDocDemoViewerComponent} from './demo-viewer.component';

@NgModule({
	declarations: [NgDocDemoViewerComponent],
	imports: [CommonModule, NgDocTabGroupModule, NgDocCodeModule, NgDocIconModule, NgDocTextModule, PolymorpheusModule],
	exports: [NgDocDemoViewerComponent],
})
export class NgDocDemoViewerModule {}
