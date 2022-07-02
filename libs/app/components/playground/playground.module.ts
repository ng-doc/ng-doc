import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {NgDocPlaygroundDemoModule} from '@ng-doc/app/components/playground-demo';
import {NgDocPlaygroundPropertiesModule} from '@ng-doc/app/components/playground-properties';
import {NgDocAsArrayModule} from '@ng-doc/ui-kit';

import {NgDocPlaygroundComponent} from './playground.component';

@NgModule({
	declarations: [NgDocPlaygroundComponent],
	imports: [CommonModule, NgDocAsArrayModule, NgDocPlaygroundDemoModule, NgDocPlaygroundPropertiesModule],
	exports: [NgDocPlaygroundComponent],
})
export class NgDocPlaygroundModule {}
