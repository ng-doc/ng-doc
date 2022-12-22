import {NgDocPage} from '@ng-doc/core';

import {CUSTOM_DATA} from './custom-data';

export const DevelopPage: NgDocPage = {
	title: 'Develop',
	mdFile: './index.md',
	onlyForTags: ['develop'],
	data: CUSTOM_DATA,
};

export default DevelopPage;