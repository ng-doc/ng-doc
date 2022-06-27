import {NgDocApi} from '@ng-doc/builder';

export const api: NgDocApi = {
	title: 'API Reference',
	scopes: [
		{
			name: '@ng-doc/app',
			route: 'app',
			include: 'libs/app/**/*.ts',
		},
	],
};

export default api;
