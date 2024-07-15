import { NgDocPage } from '@ng-doc/core';

import GuidesCategory from '../ng-doc.category';
import { ButtonDemoComponent } from './demos/button-demo/button-demo.component';
import { ButtonInlineDemoComponent } from './demos/button-inline-demo/button-inline-demo.component';

const DemoPanePage: NgDocPage = {
  title: `Demo Pane`,
  mdFile: './index.md',
  category: GuidesCategory,
  order: 3,
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
