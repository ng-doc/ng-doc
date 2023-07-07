import {NgDocPage} from '@ng-doc/core';

import GuidesCategory from '../ng-doc.category';
import {ButtonDemoComponent} from './demos/button-demo/button-demo.component';

const DemoPage: NgDocPage = {
  title: 'Demo',
  mdFile: './index.md',
  category: GuidesCategory,
  order: 2,
  keyword: 'GuidesDemo',
  demos: {ButtonDemoComponent},
};

export default DemoPage;
