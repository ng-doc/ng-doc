import { NgDocPage } from '@ng-doc/core';

import { DemoComponent } from './demo.component';

const Page: NgDocPage = {
	title: `Just a Page`,
	mdFile: './index.md',
	demos: { DemoComponent },
	playgrounds: {
		BtnPlayground: {
			target: DemoComponent,
			template: `
				<ng-doc-selector [element]="test"></ng-doc-selector>

				<div #test>HAHA</div>
			`,
			hiddenInputs: ['element'],
		},
	},
};

export default Page;
