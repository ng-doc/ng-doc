import {NgDocPage} from '@ng-doc/core';
import {NgDocIconComponent} from '@ng-doc/ui-kit';

import {DemoComponent} from './demo.component';

const Page: NgDocPage = {
	title: `Just a Page`,
	mdFile: './index.md',
	demos: {DemoComponent},
	playgrounds: {
		BtnPlayground: {
			target: NgDocIconComponent,
			template: `<ng-doc-selector></ng-doc-selector>`,
		},
	},
};

export default Page;
