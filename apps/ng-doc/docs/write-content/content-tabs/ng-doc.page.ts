import { NgDocPage } from '@ng-doc/core';
import { NgDocTagComponent } from '@ng-doc/ui-kit';

import { ButtonDemoComponent } from '../../demos-and-playgrounds/examples/button-demo/button-demo.component';
import { ButtonInlineDemoComponent } from '../../demos-and-playgrounds/examples/button-inline-demo/button-inline-demo.component';
import WriteContentCategory from '../ng-doc.category';

const ContentTabsPage: NgDocPage = {
  title: 'Content tabs',
  mdFile: './index.md',
  category: WriteContentCategory,
  order: 8,
  demos: { ButtonDemoComponent, ButtonInlineDemoComponent },
  playgrounds: {
    TagPlayground: {
      target: NgDocTagComponent,
      template: `<ng-doc-selector>Tag label</ng-doc-selector>`,
    },
  },
};

export default ContentTabsPage;
