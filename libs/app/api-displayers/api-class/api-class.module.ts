import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {NgDocApiParameterModule} from '@ng-doc/app/api-displayers/api-parameter';
import {NgDocApiTypeModule} from '@ng-doc/app/api-displayers/api-type';
import {provideApiDisplayer} from '@ng-doc/app/helpers';
import {NgDocExpanderModule, NgDocLetModule, NgDocTagModule, NgDocTextModule, NgDocTooltipModule} from '@ng-doc/ui-kit';

import {NgDocApiClassComponent} from './api-class.component';

@NgModule({
	declarations: [NgDocApiClassComponent],
	imports: [
		CommonModule,
		NgDocExpanderModule,
		NgDocLetModule,
		NgDocApiParameterModule,
		NgDocApiTypeModule,
		NgDocTagModule,
		NgDocTooltipModule,
		NgDocTextModule,
	],
	providers: [provideApiDisplayer('Class', NgDocApiClassComponent)],
})
export class NgDocApiClassModule {}
