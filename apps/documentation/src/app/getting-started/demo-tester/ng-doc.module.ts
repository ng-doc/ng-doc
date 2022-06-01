import {NgModule} from '@angular/core';

import {DemoWithFilesComponent} from './demo/demo-with-files/demo-with-files.component';
import {InlineDemoComponent} from './demo/inline-demo.component';

@NgModule({
	declarations: [InlineDemoComponent, DemoWithFilesComponent],
	exports: [InlineDemoComponent, DemoWithFilesComponent],
})
export class PageModule {}
