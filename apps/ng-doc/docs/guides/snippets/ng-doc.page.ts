import {NgDocPage} from '@ng-doc/core';

import GuidesCategory from '../ng-doc.category';
import {ButtonInlineDemoComponent} from './demos/button-inline-demo.component';

const SnippetsPage: NgDocPage = {
  title: 'Snippets',
  mdFile: './index.md',
  category: GuidesCategory,
  order: 4,
  keyword: 'GuidesSnippets',
  demos: {ButtonInlineDemoComponent},
};

export default SnippetsPage;
