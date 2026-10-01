import { NgDocPage } from '@ng-doc/core';

import { ButtonDemoComponent } from '../examples/button-demo/button-demo.component';
import { ButtonInlineDemoComponent } from '../examples/button-inline-demo/button-inline-demo.component';
import DemosAndPlaygroundsCategory from '../ng-doc.category';

const DemosPage: NgDocPage = {
  title: 'Demos',
  mdFile: './index.md',
  category: DemosAndPlaygroundsCategory,
  order: 1,
  demos: { ButtonDemoComponent, ButtonInlineDemoComponent },
  route: {
    children: [
      {
        path: 'button',
        component: ButtonDemoComponent,
      },
    ],
  },
};

export default DemosPage;
