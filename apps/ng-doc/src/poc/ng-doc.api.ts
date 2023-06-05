import {NgDocApi} from '@ng-doc/core';

export const api: NgDocApi = {
	title: 'API References',
	scopes: [
		{
			name: '@ng-doc/app',
			route: 'app',
			include: 'libs/app/**/*.ts',
		},
	],
};

export default api;
