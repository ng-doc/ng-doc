import { providePageProcessor } from '@ng-doc/app';
import { NgDocPage } from '@ng-doc/core';

import parentCategory from '../ng-doc.category';
import { imageProcessor } from './demos/image.processor';
import { tableProcessor } from './demos/table.processor';

const PageProcessorsPage: NgDocPage = {
  title: `Page Processors`,
  mdFile: './index.md',
  category: parentCategory,
  order: 2,
  providers: [providePageProcessor(imageProcessor), providePageProcessor(tableProcessor)],
};

export default PageProcessorsPage;
