import {NgModule} from '@angular/core';
import {NgDocTagModule} from '@ng-doc/ui-kit';

import {DemoWithFilesComponent} from './demo/demo-with-files/demo-with-files.component';
import {InlineDemoComponent} from './demo/inline-demo.component';

@NgModule({
	declarations: [InlineDemoComponent, DemoWithFilesComponent],
	exports: [InlineDemoComponent, DemoWithFilesComponent, NgDocTagModule],
})
export class PageModule {}
