import {NgDocPage} from '@ng-doc/core';

import CustomizationCategory from '../ng-doc.category';
import {FloatingCircleComponent} from './floating-circle/floating-circle.component';
import {
  FloatingCirclePositionControlComponent
} from './floating-circle-position-control/floating-circle-position-control.component';
import {TypeControlsPageModule} from './ng-doc.module';

const TypeControlsPage: NgDocPage = {
  title: 'Type Controls',
  mdFile: './index.md',
  category: CustomizationCategory,
  order: 4,
  keyword: 'CustomizationTypeControls',
  module: TypeControlsPageModule,
  demo: {FloatingCircleComponent, FloatingCirclePositionControlComponent},
  playgrounds: {
    FloatingCircle: {
      target: FloatingCircleComponent,
      template: '<ng-doc-selector></ng-doc-selector>',
    },
  },
};

export default TypeControlsPage;
