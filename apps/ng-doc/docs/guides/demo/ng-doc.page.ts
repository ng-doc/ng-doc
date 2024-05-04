import { NgDocPage } from '@ng-doc/core';

import GuidesCategory from '../ng-doc.category';
import { ButtonDemoComponent } from './demos/button-demo/button-demo.component';
import { ButtonInlineDemoComponent } from './demos/button-inline-demo/button-inline-demo.component';

const DemoPage: NgDocPage = {
  title: 'Demo',
  mdFile: ['./index.md', './api.md'],
  category: GuidesCategory,
  order: 2,
  keyword: 'GuidesDemo',
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

export default DemoPage;
