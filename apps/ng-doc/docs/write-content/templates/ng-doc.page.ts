import { NgDocPage } from '@ng-doc/core';

import WriteContentCategory from '../ng-doc.category';

const TemplatesPage: NgDocPage = {
  title: 'Templates',
  mdFile: './index.md',
  category: WriteContentCategory,
  order: 7,
  data: {
    steps: ['Discover', 'Render', 'Link', 'Write'],
  },
};

export default TemplatesPage;
