import {page} from '@ng-doc/core';

import GuidesCategory from '../ng-doc.category';
import {ButtonInlineDemoComponent} from './demos/button-inline-demo.component';

export default page({
	title: 'Snippets',
	mdFile: './index.md',
	category: GuidesCategory,
	order: 4,
	keyword: 'GuidesSnippets',
	demos: {ButtonInlineDemoComponent},
});
