import { NgDocPage } from '@ng-doc/core';

import GettingStartedCategory from '../ng-doc.category';

const page: NgDocPage = {
  title: `Installation`,
  description: `
    NgDoc doesn't serve as a standalone application, but rather as a tool that can be integrated into
    your application to generate documentation. This means that you will need to create a new Angular
    application, or use an existing one, and install NgDoc as a dependency.
`,
  mdFile: ['./automatic.md', 'manual.md'],
  category: GettingStartedCategory,
  order: 2,
};

export default page;
