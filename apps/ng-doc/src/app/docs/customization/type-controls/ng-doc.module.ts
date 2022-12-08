import {NgModule} from '@angular/core';
import {FloatingCircleComponent} from './floating-circle/floating-circle.component';
import {CommonModule} from '@angular/common';
import {
	FloatingCirclePositionControlModule
} from '../../common/floating-circle-position-control/floating-circle-position-control.module';

@NgModule({
	imports: [CommonModule, FloatingCirclePositionControlModule],
	exports: [FloatingCircleComponent],
	declarations: [FloatingCircleComponent],
	providers: [],
})
export class TypeControlsPageModule {
}
