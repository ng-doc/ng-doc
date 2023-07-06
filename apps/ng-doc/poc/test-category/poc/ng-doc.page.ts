import {page} from '@ng-doc/core';
import {NgDocTagComponent} from '@ng-doc/ui-kit';

export default page({
	title: `poc`,
	mdFile: './index.md',
	keyword: 'Poc',
	playgrounds: {
		TagPlayground: {
			target: NgDocTagComponent,
			template: `<ng-doc-selector>Tag</ng-doc-selector>`,
		},
	},
});
