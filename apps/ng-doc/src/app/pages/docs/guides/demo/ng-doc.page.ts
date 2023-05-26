import {NgDocPage} from '@ng-doc/core';

import GuidesCategory from '../ng-doc.category';
import {ButtonDemoComponent} from './demos/button-demo/button-demo.component';
import {DemoPageModule} from './ng-doc.module';

const DemoPage: NgDocPage = {
  title: 'Demo',
  mdFile: './index.md',
  category: GuidesCategory,
  order: 2,
  keyword: 'GuidesDemo',
  // Add your module here
  module: DemoPageModule,
  // And all demos that you'd like to use
  demos: {ButtonDemoComponent},
};

export default DemoPage;
