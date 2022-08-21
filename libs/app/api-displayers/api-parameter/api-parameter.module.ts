import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {NgDocApiTypeModule} from '@ng-doc/app/api-displayers/api-type';

import {NgDocApiParameterComponent} from './api-parameter.component';

@NgModule({
	declarations: [NgDocApiParameterComponent],
	imports: [CommonModule, NgDocApiTypeModule],
	exports: [NgDocApiParameterComponent],
})
export class NgDocApiParameterModule {}
