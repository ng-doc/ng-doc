import {NgDocPage} from '@ng-doc/core';
import {NgDocTagComponent} from '@ng-doc/ui-kit';

const PocPage: NgDocPage = {
	title: `poc`,
	mdFile: './index.md',
	keyword: 'Poc',
	playgrounds: {
		TagPlayground: {
			target: NgDocTagComponent,
			template: `<ng-doc-selector>Tag</ng-doc-selector>`,
		},
	},
};

export default PocPage;
