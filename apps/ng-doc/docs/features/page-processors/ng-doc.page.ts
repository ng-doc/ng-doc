import {providePageProcessor} from '@ng-doc/app';
import {page} from '@ng-doc/core';

import parentCategory from '../ng-doc.category';
import {imageProcessor} from './demos/image.processor';
import {tableProcessor} from './demos/table.processor';

export default page({
	title: `Page Processors`,
	mdFile: './index.md',
	category: parentCategory,
	order: 2,
  keyword: 'PageProcessors',
  providers: [
    providePageProcessor(imageProcessor),
    providePageProcessor(tableProcessor)
  ]
});
