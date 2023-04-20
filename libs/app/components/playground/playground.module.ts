import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {FormsModule, ReactiveFormsModule} from '@angular/forms';
import {NgDocDemoDisplayerModule} from '@ng-doc/app/components/demo-displayer';
import {
	NgDocAsArrayModule, NgDocBindModule,
	NgDocButtonIconModule,
	NgDocButtonModule,
	NgDocCheckboxModule,
	NgDocIconModule,
	NgDocLabelModule, NgDocRunModule,
	NgDocTextModule,
	NgDocTooltipModule,
} from '@ng-doc/ui-kit';
import {PolymorpheusModule} from '@tinkoff/ng-polymorpheus';

import {NgDocPlaygroundComponent} from './playground.component';
import {NgDocPlaygroundDemoComponent} from './playground-demo/playground-demo.component';
import {NgDocPlaygroundPropertiesComponent} from './playground-properties/playground-properties.component';
import {NgDocPlaygroundPropertyComponent} from './playground-property/playground-property.component';

@NgModule({
	declarations: [
		NgDocPlaygroundComponent,
		NgDocPlaygroundPropertyComponent,
		NgDocPlaygroundPropertiesComponent,
		NgDocPlaygroundDemoComponent,
	],
	imports: [
		CommonModule,
		ReactiveFormsModule,
		NgDocLabelModule,
		NgDocTooltipModule,
		PolymorpheusModule,
		NgDocAsArrayModule,
		NgDocButtonIconModule,
		NgDocIconModule,
		NgDocTextModule,
		NgDocCheckboxModule,
		FormsModule,
		NgDocButtonModule,
		NgDocDemoDisplayerModule,
		NgDocBindModule,
		NgDocRunModule,
	],
	exports: [
		NgDocPlaygroundComponent,
		NgDocPlaygroundPropertyComponent,
		NgDocPlaygroundPropertiesComponent,
		NgDocPlaygroundDemoComponent,
	],
})
export class NgDocPlaygroundModule {}
