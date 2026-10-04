import { provideTypeControl } from '@ng-doc/app';
import { NgDocPage } from '@ng-doc/core';

import DemosAndPlaygroundsCategory from '../ng-doc.category';
import { FloatingCircleComponent } from '../playgrounds/floating-circle/floating-circle.component';
import { FloatingCirclePositionControlComponent } from '../playgrounds/floating-circle-position-control/floating-circle-position-control.component';

const CustomTypeControlsPage: NgDocPage = {
  title: 'Custom type controls',
  mdFile: './index.md',
  category: DemosAndPlaygroundsCategory,
  order: 5,
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

export default CustomTypeControlsPage;
