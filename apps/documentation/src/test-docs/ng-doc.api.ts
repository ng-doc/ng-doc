import {NgDocApi} from '@ng-doc/builder';

export const api: NgDocApi = {
	title: 'API',
	scopes: [
		{
			name: '@ng-doc/app',
			route: 'app',
			include: 'libs/app/**/*.ts',
		},
		{
			name: '@ng-doc/builder',
			route: 'builder',
			include: 'libs/builder/**/*.ts',
		},
		{
			name: '@ng-doc/core',
			route: 'core',
			include: 'libs/core/**/*.ts',
		},
	],
};

export default api;
