import { providePageProcessor } from '@ng-doc/app';
import { NgDocPage } from '@ng-doc/core';

import { imageProcessor } from '../../docs/features/page-processors/demos/image.processor';

const AnotherPagePage: NgDocPage = {
  title: `another-page`,
  mdFile: './index.md',
  keyword: 'AnotherPage',
  providers: [providePageProcessor(imageProcessor)],
};

export default AnotherPagePage;
