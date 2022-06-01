import {NgDocPage} from '@ng-doc/builder';

import SomeCategory from './ng-doc.category';

const SomePage: NgDocPage = {
	mdFile: './index.md',
	title: 'Some Page',
	category: SomeCategory,
};

export default SomePage;
