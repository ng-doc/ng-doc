import { providePageProcessor } from '@ng-doc/app';
import { NgDocPage } from '@ng-doc/core';

import CustomizeCategory from '../ng-doc.category';
import { imageProcessor } from './demos/image.processor';
import { tableProcessor } from './demos/table.processor';

const CustomPageComponentsPage: NgDocPage = {
  title: 'Custom page components',
  mdFile: './index.md',
  category: CustomizeCategory,
  order: 7,
  providers: [providePageProcessor(imageProcessor), providePageProcessor(tableProcessor)],
};

export default CustomPageComponentsPage;
