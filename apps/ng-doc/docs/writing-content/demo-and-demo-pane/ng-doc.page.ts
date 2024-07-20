import { NgDocPage } from '@ng-doc/core';

import WritingContentCategory from '../ng-doc.category';
import { ButtonDemoComponent } from './demos/button-demo/button-demo.component';
import { ButtonInlineDemoComponent } from './demos/button-inline-demo/button-inline-demo.component';

const DemoAndDemoPanePage: NgDocPage = {
  title: 'Demo and Demo Pane',
  mdFile: ['./index.md', './demo.md', './demo-pane.md', './snippets.md'],
  category: WritingContentCategory,
  order: 7,
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

export default DemoAndDemoPanePage;
