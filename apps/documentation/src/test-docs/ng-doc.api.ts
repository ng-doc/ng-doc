import {NgDocApi} from '@ng-doc/builder';

export const api: NgDocApi = {
	title: 'API',
	scopes: [
		{
			name: '@ng-doc/builder',
			route: 'builder',
			include: 'libs/builder/**/*.ts',
		},
	],
};

export default api;
