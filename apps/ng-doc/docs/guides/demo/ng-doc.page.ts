import {page} from '@ng-doc/core';

import GuidesCategory from '../ng-doc.category';
import {ButtonDemoComponent} from './demos/button-demo/button-demo.component';

export default page({
	title: 'Demo',
	mdFile: './index.md',
	category: GuidesCategory,
	order: 2,
	keyword: 'GuidesDemo',
	demos: {ButtonDemoComponent},
});
