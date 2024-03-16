import { providePageProcessor } from '@ng-doc/app';
import { NgDocPage } from '@ng-doc/core';

import { imageProcessor } from '../../docs/features/page-processors/demos/image.processor';

const AnotherPagePage: NgDocPage = {
  title: `Another Page`,
  description: `This is another page for the POC. It's a simple page with a simple description.`,
  mdFile: ['./index.md', './api.md'],
  keyword: 'AnotherPage',
  providers: [providePageProcessor(imageProcessor)],
};

export default AnotherPagePage;
