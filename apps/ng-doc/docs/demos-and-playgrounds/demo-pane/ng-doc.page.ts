import { NgDocPage } from '@ng-doc/core';

import { ButtonDemoComponent } from '../examples/button-demo/button-demo.component';
import { ButtonInlineDemoComponent } from '../examples/button-inline-demo/button-inline-demo.component';
import DemosAndPlaygroundsCategory from '../ng-doc.category';

const DemoPanePage: NgDocPage = {
  title: 'Demo pane',
  mdFile: './index.md',
  category: DemosAndPlaygroundsCategory,
  order: 2,
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

export default DemoPanePage;
