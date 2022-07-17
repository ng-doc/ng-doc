import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {NgDocDemoDisplayerModule} from '@ng-doc/app/components/demo-displayer';

import {NgDocPlaygroundDemoComponent} from './playground-demo.component';

@NgModule({
	declarations: [NgDocPlaygroundDemoComponent],
	imports: [CommonModule, NgDocDemoDisplayerModule],
	exports: [NgDocPlaygroundDemoComponent],
})
export class NgDocPlaygroundDemoModule {}
