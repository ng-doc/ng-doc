import {NgDocDependencies} from '@ng-doc/builder';

import {FloatingCirclePositionControlComponent} from '../../common/floating-circle-position-control/floating-circle-position-control.component';
import {FloatingCircleComponent} from './floating-circle/floating-circle.component';
import {TypeControlsPageModule} from './ng-doc.module';

const TypeControlsPageDependencies: NgDocDependencies = {
	module: TypeControlsPageModule,
	demo: {FloatingCircleComponent, FloatingCirclePositionControlComponent}
}

export default TypeControlsPageDependencies;
