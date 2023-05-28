import {NgDocPage} from '@ng-doc/core';

import GuidesCategory from '../ng-doc.category';
import {ButtonDemoComponent} from './demos/button-demo/button-demo.component';

const DemoPanePage: NgDocPage = {
  title: `Demo Pane`,
  mdFile: './index.md',
  category: GuidesCategory,
  order: 3,
  keyword: 'GuidesDemoPane',
  demos: {ButtonDemoComponent},
};

export default DemoPanePage;
