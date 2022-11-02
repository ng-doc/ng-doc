import {NgDocPage} from '@ng-doc/builder';

import CreatingPageCategory from './ng-doc.category';

export const CreatePage: NgDocPage = {
	title: 'Create',
	category: CreatingPageCategory,
	mdFile: './index.md',
	route: 'create',
	order: 1,
};

export default CreatePage;
