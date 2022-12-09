import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';

import {
	FloatingCirclePositionControlModule
} from '../../common/floating-circle-position-control/floating-circle-position-control.module';
import {FloatingCircleComponent} from './floating-circle/floating-circle.component';

@NgModule({
	imports: [CommonModule, FloatingCirclePositionControlModule],
	exports: [FloatingCircleComponent],
	declarations: [FloatingCircleComponent],
	providers: [],
})
export class TypeControlsPageModule {
}
