import {NgDocAngularEntities, NgDocDeclarations, NgDocPage} from '@ng-doc/core';

export const DevelopPage: NgDocPage = {
	title: 'Develop',
	mdFile: './index.md.nunj',
	onlyForTags: ['development'],
	data: {
		modifiers: ['abstract', 'static', 'async', 'readonly'],
		entities: {
			typescript: NgDocDeclarations,
			angular: NgDocAngularEntities,
		},
	},
};

export default DevelopPage;
