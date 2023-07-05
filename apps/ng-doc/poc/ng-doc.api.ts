import {NgDocApi} from '@ng-doc/core';

export const api: NgDocApi = {
	title: 'API References',
	scopes: [{
		name: 'Components',
		route: 'components',
		include: 'libs/ui-kit/components/tag/*.ts'
	}],
};

export default api;
