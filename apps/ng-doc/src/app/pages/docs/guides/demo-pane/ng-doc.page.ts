import {NgDocPage} from '@ng-doc/core';

import GuidesCategory from '../ng-doc.category';
import {ButtonDemoComponent} from './demos/button-demo/button-demo.component';
import {DemoPanePageModule} from './ng-doc.module';

const DemoPanePage: NgDocPage = {
  title: `Demo Pane`,
  mdFile: './index.md',
  category: GuidesCategory,
  order: 3,
  keyword: 'GuidesDemoPane',
  module: DemoPanePageModule,
  // Add your demos that you are going to use in the page here
  demo: {ButtonDemoComponent},
};

export default DemoPanePage;
