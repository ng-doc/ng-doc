import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {NgDocApiMethodsModule} from '@ng-doc/app/api-displayers/api-methods';
import {NgDocApiPropertiesModule} from '@ng-doc/app/api-displayers/api-properties';
import {provideApiDisplayer} from '@ng-doc/app/helpers';
import {NgDocTagModule, NgDocTextModule, NgDocTooltipModule} from '@ng-doc/ui-kit';

import {NgDocApiClassComponent} from './api-class.component';

@NgModule({
	declarations: [NgDocApiClassComponent],
	imports: [
		CommonModule,
		NgDocTagModule,
		NgDocTooltipModule,
		NgDocTextModule,
		NgDocApiPropertiesModule,
		NgDocApiMethodsModule,
	],
	providers: [provideApiDisplayer('Class', NgDocApiClassComponent)],
})
export class NgDocApiClassModule {}
