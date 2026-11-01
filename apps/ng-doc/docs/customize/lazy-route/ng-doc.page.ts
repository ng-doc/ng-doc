import { NgDocPage } from '@ng-doc/core';

import CustomizeCategory from '../ng-doc.category';

const LazyRoutePage: NgDocPage = {
  title: 'NgDoc under a lazy route',
  mdFile: './index.md',
  category: CustomizeCategory,
  order: 9,
};

export default LazyRoutePage;
