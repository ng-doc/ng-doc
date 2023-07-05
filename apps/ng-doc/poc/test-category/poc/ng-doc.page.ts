import {NgDocPage} from '@ng-doc/core';

import {FormatDatePipe} from './format-date.pipe';

const PocPage: NgDocPage = {
	title: `poc`,
	mdFile: './index.md',
	keyword: 'Poc',
	playgrounds: {
		DatePipePlayground: {
			target: FormatDatePipe,
			template: `{{'2023-06-05T08:00:00.000Z' | formatDate}}`,
		},
	},
};

export default PocPage;
