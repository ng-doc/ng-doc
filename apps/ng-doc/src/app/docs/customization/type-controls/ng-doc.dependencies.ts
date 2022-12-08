import {NgDocDependencies} from '@ng-doc/builder';
import {TypeControlsPageModule} from './ng-doc.module';
import {FloatingCircleComponent} from './floating-circle/floating-circle.component';
import {FloatingCirclePositionControlComponent} from '../../common/floating-circle-position-control/floating-circle-position-control.component';

const TypeControlsPageDependencies: NgDocDependencies = {
	module: TypeControlsPageModule,
	demo: {FloatingCircleComponent, FloatingCirclePositionControlComponent}
}

export default TypeControlsPageDependencies;
