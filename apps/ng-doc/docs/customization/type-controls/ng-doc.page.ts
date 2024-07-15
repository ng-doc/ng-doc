import { provideTypeControl } from '@ng-doc/app';
import { NgDocPage } from '@ng-doc/core';

import CustomizationCategory from '../ng-doc.category';
import { FloatingCircleComponent } from './floating-circle/floating-circle.component';
import { FloatingCirclePositionControlComponent } from './floating-circle-position-control/floating-circle-position-control.component';

const TypeControlsPage: NgDocPage = {
  title: 'Type Controls',
  mdFile: './index.md',
  category: CustomizationCategory,
  providers: [
    provideTypeControl('FloatingCirclePosition', FloatingCirclePositionControlComponent, {
      hideLabel: true,
    }),
  ],
  demos: { FloatingCircleComponent, FloatingCirclePositionControlComponent },
  playgrounds: {
    FloatingCircle: {
      target: FloatingCircleComponent,
      template: '<ng-doc-selector></ng-doc-selector>',
    },
  },
};

export default TypeControlsPage;
