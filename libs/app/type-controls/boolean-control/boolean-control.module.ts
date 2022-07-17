import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {provideTypeControl} from '@ng-doc/app/helpers';
import {NgDocToggleModule} from '@ng-doc/ui-kit';

import {NgDocBooleanControlComponent} from './boolean-control.component';

@NgModule({
	declarations: [NgDocBooleanControlComponent],
	imports: [CommonModule, NgDocToggleModule],
	providers: [provideTypeControl<boolean>('boolean', NgDocBooleanControlComponent)],
	exports: [NgDocBooleanControlComponent],
})
export class NgDocBooleanControlModule {}
