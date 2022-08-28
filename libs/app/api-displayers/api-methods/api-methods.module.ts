import {CdkTableModule} from '@angular/cdk/table';
import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {NgDocApiParameterModule} from '@ng-doc/app/api-displayers/api-parameter';
import {NgDocApiTypeModule} from '@ng-doc/app/api-displayers/api-type';
import {NgDocTagModule, NgDocTooltipModule} from '@ng-doc/ui-kit';

import {NgDocApiMethodsComponent} from './api-methods.component';

@NgModule({
	declarations: [NgDocApiMethodsComponent],
	imports: [
		CommonModule,
		CdkTableModule,
		NgDocTagModule,
		NgDocTooltipModule,
		NgDocApiParameterModule,
		NgDocApiTypeModule,
	],
	exports: [NgDocApiMethodsComponent],
})
export class NgDocApiMethodsModule {}
