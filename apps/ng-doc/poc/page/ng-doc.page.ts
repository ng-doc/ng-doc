import { NgDocPage } from '@ng-doc/core';

import { BtnDirective } from './btn.directive';
import { DemoComponent } from './demo.component';

const Page: NgDocPage = {
  title: `Page`,
  mdFile: './index.md',
  demos: { DemoComponent },
  playgrounds: {
    Btn: {
      target: BtnDirective,
      template: `<ng-doc-selector></ng-doc-selector>`,
    },
  },
};

export default Page;
