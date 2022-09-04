import {NgModule} from '@angular/core';
import {NgDocComboboxModule, NgDocDataModule, NgDocListModule, NgDocOptionModule, NgDocTagModule} from '@ng-doc/ui-kit';

import {DemoWithFilesComponent} from './demo/demo-with-files/demo-with-files.component';
import {InlineDemoComponent} from './demo/inline-demo.component';

@NgModule({
	declarations: [InlineDemoComponent, DemoWithFilesComponent],
	exports: [
		InlineDemoComponent,
		DemoWithFilesComponent,
		NgDocTagModule,
		NgDocComboboxModule,
		NgDocListModule,
		NgDocOptionModule,
		NgDocDataModule,
	],
})
export class PageModule {}
