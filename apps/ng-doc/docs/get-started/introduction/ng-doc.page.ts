import { NgDocPage } from '@ng-doc/core';

import GetStartedCategory from '../ng-doc.category';
import { BadgeComponent } from '../your-first-page/example/src/app/badge/badge.component';
import { BadgeDemoComponent } from '../your-first-page/example/src/docs/components/badge/badge-demo.component';

const IntroductionPage: NgDocPage = {
  title: 'Introduction',
  mdFile: './index.md',
  category: GetStartedCategory,
  order: 1,
  demos: { BadgeDemoComponent },
  playgrounds: {
    BadgePlayground: {
      target: BadgeComponent,
      template: `<ng-doc-selector></ng-doc-selector>`,
    },
  },
};

export default IntroductionPage;
