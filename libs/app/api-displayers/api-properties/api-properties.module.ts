import {CdkTableModule} from '@angular/cdk/table';
import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {NgDocApiTypeModule} from '@ng-doc/app/api-displayers/api-type';
import {NgDocTagModule, NgDocTooltipModule} from '@ng-doc/ui-kit';

import {NgDocApiPropertiesComponent} from './api-properties.component';

@NgModule({
	declarations: [NgDocApiPropertiesComponent],
	imports: [CommonModule, CdkTableModule, NgDocTagModule, NgDocTooltipModule, NgDocApiTypeModule],
	exports: [NgDocApiPropertiesComponent],
})
export class NgDocApiPropertiesModule {}
