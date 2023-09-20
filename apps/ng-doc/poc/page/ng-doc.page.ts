import { NgDocPage } from '@ng-doc/core';

import { DemoComponent } from './demo.component';
import { FormatDatePipe } from './format-date.pipe';

const Page: NgDocPage = {
	title: `Just a Page`,
	mdFile: './index.md',
	demos: { DemoComponent },
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
			target: FormatDatePipe,
			template: `{{'2023-06-05T08:00:00.000Z' | formatDate}}`,
		},
	},
};

export default Page;
