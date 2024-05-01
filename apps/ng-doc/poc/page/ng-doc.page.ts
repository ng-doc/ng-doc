import { NgDocPage } from '@ng-doc/core';
import { NgDocRotatorDirective } from '@ng-doc/ui-kit';

import { DemoComponent } from './demo.component';

const Page: NgDocPage = {
	title: `Just a Page`,
	mdFile: './index.md',
	demos: { DemoComponent },
	playgrounds: {
		BtnPlayground: {
			target: NgDocRotatorDirective,
			template: `
				<ng-doc-selector>123</ng-doc-selector>
			`,
			hiddenInputs: ['element'],
		},
	},
};

export default Page;
