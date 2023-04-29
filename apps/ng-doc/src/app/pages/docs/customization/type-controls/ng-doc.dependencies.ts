import {NgDocDependencies} from '@ng-doc/core';

import {FloatingCircleComponent} from './floating-circle/floating-circle.component';
import {FloatingCirclePositionControlComponent} from './floating-circle-position-control/floating-circle-position-control.component';
import {TypeControlsPageModule} from './ng-doc.module';

const TypeControlsPageDependencies: NgDocDependencies = {
	module: TypeControlsPageModule,
	demo: {FloatingCircleComponent, FloatingCirclePositionControlComponent},
	playgrounds: {
		FloatingCircle: {
			target: FloatingCircleComponent,
			template: '<ng-doc-selector></ng-doc-selector>',
		},
	},
};

export default TypeControlsPageDependencies;
