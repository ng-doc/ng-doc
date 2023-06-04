import {NgDocPage} from '@ng-doc/core';

import {BtnDirective} from './btn.directive';

const PocPage: NgDocPage = {
	title: `poc`,
	mdFile: './index.md',
	playgrounds: {
		BtnPlayground: {
			target: BtnDirective,
			template: `<div ngDocBtn>123</div>`,
		},
	},
};

export default PocPage;
