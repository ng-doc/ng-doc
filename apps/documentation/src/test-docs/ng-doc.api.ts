import {NgDocApi} from '@ng-doc/builder';

export const api: NgDocApi = {
	title: 'API',
	scopes: [
		{
			name: '@ng-doc/app',
			route: 'app',
			include: 'libs/app/**/*.ts',
		},
	],
};

export default api;
