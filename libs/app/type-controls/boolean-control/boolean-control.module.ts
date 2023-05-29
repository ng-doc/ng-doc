import {CommonModule} from '@angular/common';
import {NgModule, Provider} from '@angular/core';
import {provideTypeControl} from '@ng-doc/app/helpers';

import {NgDocBooleanControlComponent} from './boolean-control.component';

const provider: Provider = provideTypeControl('boolean', NgDocBooleanControlComponent, {hideLabel: true, order: 40});

@NgModule({
	imports: [CommonModule, NgDocBooleanControlComponent],
	providers: [provider],
	exports: [NgDocBooleanControlComponent],
})
export class NgDocBooleanControlModule {}
