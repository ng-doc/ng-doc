import {NgDocPage} from '@ng-doc/builder';

const page: NgDocPage = {
	title: `Demo Tester`,
	mdFile: './index.md',
	scope: __dirname,
	onlyForTags: ['develop'],
};

export default page;
