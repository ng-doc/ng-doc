import {NgDocApi} from '@ng-doc/core';

export const api: NgDocApi = {
	title: 'API',
	scopes: [
		{
			name: '@ng-doc/app',
			route: 'app',
			include: 'libs/app/index.ts',
		},
		{
			name: '@ng-doc/builder',
			route: 'builder',
			include: 'libs/builder/index.ts',
		},
		{
			name: '@ng-doc/ui-kit',
			route: 'ui-kit',
			include: 'libs/ui-kit/index.ts',
		},
		{
			name: '@ng-doc/core',
			route: 'core',
			include: 'libs/core/index.ts',
		},
	],
};

export default api;
