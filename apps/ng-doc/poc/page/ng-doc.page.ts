import {NgDocPage} from '@ng-doc/core';
import {NgDocTagComponent} from '@ng-doc/ui-kit';

const Page: NgDocPage = {
	title: `Just a Page`,
	mdFile: './index.md',
	playgrounds: {
		TagPlayground: {
			target: NgDocTagComponent,
			template: `<ng-doc-selector>Tag</ng-doc-selector>`,
		},
	},
};

export default Page;
