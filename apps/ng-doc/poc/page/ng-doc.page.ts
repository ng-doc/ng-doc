import { NgDocPage } from '@ng-doc/core';

import { DemoComponent } from './demo.component';

const Page: NgDocPage = {
  title: `Page`,
  mdFile: './index.md',
  demos: { DemoComponent },
};

export default Page;
