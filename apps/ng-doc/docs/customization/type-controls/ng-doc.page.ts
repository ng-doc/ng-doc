import {NgDocPage} from '@ng-doc/core';

import CustomizationCategory from '../ng-doc.category';
import {FloatingCircleComponent} from './floating-circle/floating-circle.component';
import {FloatingCirclePositionControlComponent} from './floating-circle-position-control/floating-circle-position-control.component';
import {FloatingCirclePositionControlModule} from './floating-circle-position-control/floating-circle-position-control.module';

const TypeControlsPage: NgDocPage = {
  title: 'Type Controls',
  mdFile: './index.md',
  category: CustomizationCategory,
  keyword: 'CustomizationTypeControls',
  imports: [FloatingCirclePositionControlModule],
  demos: {FloatingCircleComponent, FloatingCirclePositionControlComponent},
  playgrounds: {
    FloatingCircle: {
      target: FloatingCircleComponent,
      template: '<ng-doc-selector></ng-doc-selector>',
    },
  },
};

export default TypeControlsPage;
