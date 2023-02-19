import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {ReactiveFormsModule} from '@angular/forms';
import {provideTypeControl} from '@ng-doc/app';
import {NgDocLabelModule} from '@ng-doc/ui-kit';

import {FloatingCirclePositionControlComponent} from './floating-circle-position-control.component';

@NgModule({
	imports: [CommonModule, ReactiveFormsModule, NgDocLabelModule],
	declarations: [FloatingCirclePositionControlComponent],
	// Registering the control as a Type Control
	providers: [provideTypeControl('FloatingCirclePosition', FloatingCirclePositionControlComponent)],
	exports: [FloatingCirclePositionControlComponent],
})
export class FloatingCirclePositionControlModule {}
