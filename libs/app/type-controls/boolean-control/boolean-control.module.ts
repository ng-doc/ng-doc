import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {provideTypeControl} from '@ng-doc/app/helpers';
import {NgDocCheckboxModule, NgDocTooltipModule} from '@ng-doc/ui-kit';

import {NgDocBooleanControlComponent} from './boolean-control.component';

@NgModule({
	declarations: [NgDocBooleanControlComponent],
	imports: [CommonModule, NgDocCheckboxModule, NgDocTooltipModule],
	providers: [provideTypeControl('boolean', NgDocBooleanControlComponent, {hideLabel: true})],
	exports: [NgDocBooleanControlComponent],
})
export class NgDocBooleanControlModule {}
