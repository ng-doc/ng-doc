import {NgDocPage} from '@ng-doc/core';

import {BtnDirective} from './btn.directive';
import {DemoComponent} from './demo.component';

const Page: NgDocPage = {
	title: `Just a Page`,
	mdFile: './index.md',
	demos: {DemoComponent},
	playgrounds: {
		BtnPlayground: {
			target: BtnDirective,
			template: `<ng-doc-selector></ng-doc-selector>`,
		}
	}
};

export default Page;
