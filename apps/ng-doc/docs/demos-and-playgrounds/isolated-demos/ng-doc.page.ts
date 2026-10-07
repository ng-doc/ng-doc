import { NgDocPage } from '@ng-doc/core';

import { ViewportDemoComponent } from '../examples/viewport-demo/viewport-demo.component';
import DemosAndPlaygroundsCategory from '../ng-doc.category';

const IsolatedDemosPage: NgDocPage = {
  title: 'Isolated demos',
  mdFile: './index.md',
  category: DemosAndPlaygroundsCategory,
  order: 6,
  demos: { ViewportDemoComponent },
};

export default IsolatedDemosPage;
