import { NgDocPage } from '@ng-doc/core';

import GetStartedCategory from '../ng-doc.category';
import { BadgeComponent } from './example/src/app/badge/badge.component';
import { BadgeDemoComponent } from './example/src/docs/components/badge/badge-demo.component';

/**
 * @status:info NEW
 */
const YourFirstPage: NgDocPage = {
  title: 'Your first page',
  mdFile: './index.md',
  category: GetStartedCategory,
  order: 3,
  demos: { BadgeDemoComponent },
  playgrounds: {
    BadgePlayground: {
      target: BadgeComponent,
      template: `<ng-doc-selector></ng-doc-selector>`,
    },
  },
};

export default YourFirstPage;
