import {CommonModule} from '@angular/common';
import {NgModule, Provider} from '@angular/core';
import {provideTypeControl} from '@ng-doc/app/helpers';
import {NgDocCheckboxModule, NgDocTooltipModule} from '@ng-doc/ui-kit';

import {NgDocBooleanControlComponent} from './boolean-control.component';

const provider: Provider = provideTypeControl('boolean', NgDocBooleanControlComponent, {hideLabel: true, order: 40});

@NgModule({
	declarations: [NgDocBooleanControlComponent],
	imports: [CommonModule, NgDocCheckboxModule, NgDocTooltipModule],
	providers: [provider],
	exports: [NgDocBooleanControlComponent],
})
export class NgDocBooleanControlModule {}
