import { NgDocPage } from '@ng-doc/core';

import { SnippetsDemoComponent } from '../examples/snippets-demo/snippets-demo.component';
import DemosAndPlaygroundsCategory from '../ng-doc.category';

const SnippetsPage: NgDocPage = {
  title: 'Snippets',
  mdFile: './index.md',
  category: DemosAndPlaygroundsCategory,
  order: 3,
  demos: { SnippetsDemoComponent },
};

export default SnippetsPage;
