import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {NgDocPlaygroundPropertyModule} from '@ng-doc/app/components/playground-property';
import {NgDocButtonIconModule, NgDocIconModule, NgDocTooltipModule} from '@ng-doc/ui-kit';

import {NgDocPlaygroundPropertiesComponent} from './playground-properties.component';

@NgModule({
	declarations: [NgDocPlaygroundPropertiesComponent],
	imports: [
		CommonModule,
		NgDocPlaygroundPropertyModule,
		NgDocButtonIconModule,
		NgDocIconModule,
		NgDocTooltipModule,
		NgDocTooltipModule,
	],
	exports: [NgDocPlaygroundPropertiesComponent],
})
export class NgDocPlaygroundPropertiesModule {}
