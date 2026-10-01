import { NgDocPage } from '@ng-doc/core';

import WriteContentCategory from '../ng-doc.category';

const PagesAndCategoriesPage: NgDocPage = {
  title: 'Pages and categories',
  // The second file is a live example of page tabs.
  mdFile: ['./index.md', './tab-example.md'],
  category: WriteContentCategory,
  order: 1,
};

export default PagesAndCategoriesPage;
