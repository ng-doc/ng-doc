import {NgModule} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FloatingCirclePositionControlComponent} from './floating-circle-position-control.component';
import {ReactiveFormsModule} from '@angular/forms';
import {provideTypeControl} from '@ng-doc/app';

@NgModule({
	imports: [CommonModule, ReactiveFormsModule],
	declarations: [FloatingCirclePositionControlComponent],
	// Registering control as a Type Control
	providers: [provideTypeControl('FloatingCirclePosition', FloatingCirclePositionControlComponent)],
	exports: [FloatingCirclePositionControlComponent],
})
export class FloatingCirclePositionControlModule {}
