import {NgDocPage} from '@ng-doc/builder';

import GettingStartedCategory from '../ng-doc.category';

const page: NgDocPage = {
	title: `Demo Tester`,
	mdFile: './index.md',
	category: GettingStartedCategory,
	scope: __dirname,
};

export default page;

export class TestClass {
	property1 = 'asd'
	private property2 = 'asd'

	constructor(
		some: string,
	) {
	}

	method1(): void {

	}

	private method2(): void {

	}
}
