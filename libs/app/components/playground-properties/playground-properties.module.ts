import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {NgDocPlaygroundPropertyModule} from '@ng-doc/app/components/playground-property';
import {
	NgDocButtonIconModule,
	NgDocButtonModule,
	NgDocCheckboxModule,
	NgDocIconModule,
	NgDocTextModule,
	NgDocTooltipModule,
} from '@ng-doc/ui-kit';

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
		NgDocTextModule,
		NgDocCheckboxModule,
		FormsModule,
		NgDocButtonModule,
	],
	exports: [NgDocPlaygroundPropertiesComponent],
})
export class NgDocPlaygroundPropertiesModule {}
