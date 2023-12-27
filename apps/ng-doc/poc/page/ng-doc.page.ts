import { NgDocPage } from '@ng-doc/core';

import MyCategoryCategory from '../my-category/ng-doc.category';
import { DemoComponent } from './demo.component';

const Page: NgDocPage = {
	title: `Just a Page`,
	mdFile: './index.md',
	demos: { DemoComponent },
	category: MyCategoryCategory,
	route: {
		children: [
			{
				path: 'demo1',
				component: DemoComponent,
			},
		],
	},
	playgrounds: {
		BtnPlayground: {
			target: DemoComponent,
			template: `<ng-doc-selector></ng-doc-selector>`,
		},
	},
};

export default Page;
