import {page} from '@ng-doc/core';

import CustomizationCategory from '../ng-doc.category';
import {FloatingCircleComponent} from './floating-circle/floating-circle.component';
import {FloatingCirclePositionControlComponent} from './floating-circle-position-control/floating-circle-position-control.component';
import {FloatingCirclePositionControlModule} from './floating-circle-position-control/floating-circle-position-control.module';

export default page({
	title: 'Type Controls',
	mdFile: './index.md',
	category: CustomizationCategory,
	order: 4,
	keyword: 'CustomizationTypeControls',
	imports: [FloatingCirclePositionControlModule],
	demos: {FloatingCircleComponent, FloatingCirclePositionControlComponent},
	playgrounds: {
		FloatingCircle: {
			target: FloatingCircleComponent,
			template: '<ng-doc-selector></ng-doc-selector>',
		},
	},
});
