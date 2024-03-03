import { NgDocPage } from '@ng-doc/core';

import { DemoComponent } from './demo.component';

const Page: NgDocPage = {
	title: `Just a Page`,
	mdFile: './index.md',
	demos: { DemoComponent },
	playgrounds: {
		BtnPlayground: {
			target: DemoComponent,
			template: `<ng-doc-selector></ng-doc-selector>`,
			controls: {
				size: { type: 'NgDocTypeAlias', options: ['s', 'm', 'l', 'xl'] },
			},
		},
	},
};

export default Page;
